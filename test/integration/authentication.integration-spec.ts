import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationStatus, UserRole, UserStatus } from '@prisma/client';
import { hash, verify } from 'argon2';
import { randomUUID } from 'node:crypto';
import request, { Response as SupertestResponse } from 'supertest';
import { configureApplication } from '../../src/application';
import { AppModule } from '../../src/app.module';
import { PasswordResetService } from '../../src/auth/application/password-reset.service';
import { EMAIL_GATEWAY } from '../../src/auth/application/ports/email-gateway.port';
import type {
  EmailGateway,
  PasswordResetEmail,
} from '../../src/auth/application/ports/email-gateway.port';
import { PASSWORD_RESET_DELIVERY_OBSERVER } from '../../src/auth/application/ports/password-reset-delivery-observer.port';
import type {
  PasswordResetDeliveryFailureStage,
  PasswordResetDeliveryObserver,
} from '../../src/auth/application/ports/password-reset-delivery-observer.port';
import {
  ACCESS_TOKEN_SERVICE,
  REFRESH_TOKEN_SERVICE,
} from '../../src/auth/application/ports/token-services.port';
import type {
  AccessTokenService,
  RefreshTokenService,
} from '../../src/auth/application/ports/token-services.port';
import {
  accessCookieName,
  refreshCookieName,
} from '../../src/auth/http/auth-cookies';
import { readEnvironment } from '../../src/config/environment';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';

const allowedOrigin = 'http://localhost:3000';
const testPassword = 'CicleraAuthTest!2026';

interface TestIdentity {
  id: string;
  organizationId: string;
  email: string;
  displayEmail: string;
}

class TestEmailGateway implements EmailGateway {
  availability: 'available' | 'disabled' | 'unavailable' = 'available';
  failDeliveries = false;
  readonly messages: PasswordResetEmail[] = [];

  isAvailable(): boolean {
    return this.availability === 'available';
  }

  sendPasswordReset(input: PasswordResetEmail): Promise<void> {
    if (this.failDeliveries) {
      return Promise.reject(new Error('Controlled test delivery failure.'));
    }

    this.messages.push(input);
    return Promise.resolve();
  }

  reset(): void {
    this.availability = 'available';
    this.failDeliveries = false;
    this.messages.length = 0;
  }
}

class TestPasswordResetDeliveryObserver implements PasswordResetDeliveryObserver {
  readonly failures: PasswordResetDeliveryFailureStage[] = [];

  recordFailure(stage: PasswordResetDeliveryFailureStage): void {
    this.failures.push(stage);
  }

  reset(): void {
    this.failures.length = 0;
  }
}

describe('Authentication flow', () => {
  let moduleRef: TestingModule;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let accessTokens: AccessTokenService;
  let refreshTokens: RefreshTokenService;
  let emailGateway: TestEmailGateway;
  let deliveryObserver: TestPasswordResetDeliveryObserver;
  let passwordResetService: PasswordResetService;
  let originalPasswordHash: string;
  let organizationAId: string;
  let organizationBId: string;
  let userA: TestIdentity;
  let userB: TestIdentity;

  beforeAll(async () => {
    emailGateway = new TestEmailGateway();
    deliveryObserver = new TestPasswordResetDeliveryObserver();
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_GATEWAY)
      .useValue(emailGateway)
      .overrideProvider(PASSWORD_RESET_DELIVERY_OBSERVER)
      .useValue(deliveryObserver)
      .compile();
    prisma = moduleRef.get(PrismaService);
    passwordResetService = moduleRef.get(PasswordResetService);
    accessTokens = moduleRef.get<AccessTokenService>(ACCESS_TOKEN_SERVICE);
    refreshTokens = moduleRef.get<RefreshTokenService>(REFRESH_TOKEN_SERVICE);

    const [connection] = await prisma.$queryRaw<
      Array<{ databaseName: string }>
    >`SELECT current_database() AS "databaseName"`;

    if (connection?.databaseName !== databaseNameFromTestUrl()) {
      throw new Error(
        'Authentication tests connected to an unexpected database.',
      );
    }

    originalPasswordHash = await hash(testPassword);
    const organizationA = await prisma.organization.create({
      data: { name: 'Auth tenant A', status: OrganizationStatus.ACTIVE },
    });
    const organizationB = await prisma.organization.create({
      data: { name: 'Auth tenant B', status: OrganizationStatus.ACTIVE },
    });
    organizationAId = organizationA.id;
    organizationBId = organizationB.id;
    const suffix = `${Date.now()}-${process.pid}`;
    const createdUserA = await prisma.user.create({
      data: {
        organizationId: organizationAId,
        name: 'Auth Owner A',
        email: `Auth.Owner.A.${suffix}@Example.test`,
        normalizedEmail: `auth.owner.a.${suffix}@example.test`,
        passwordHash: originalPasswordHash,
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
      },
    });
    const createdUserB = await prisma.user.create({
      data: {
        organizationId: organizationBId,
        name: 'Auth Admin B',
        email: `auth.admin.b.${suffix}@example.test`,
        normalizedEmail: `auth.admin.b.${suffix}@example.test`,
        passwordHash: originalPasswordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    userA = {
      id: createdUserA.id,
      organizationId: createdUserA.organizationId,
      email: createdUserA.normalizedEmail,
      displayEmail: createdUserA.email,
    };
    userB = {
      id: createdUserB.id,
      organizationId: createdUserB.organizationId,
      email: createdUserB.normalizedEmail,
      displayEmail: createdUserB.email,
    };

    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApplication(app, {
      ...readEnvironment(moduleRef.get(ConfigService)),
      NODE_ENV: 'test',
    });
    await app.init();
  });

  beforeEach(async () => {
    emailGateway.reset();
    deliveryObserver.reset();
    await prisma.passwordResetToken.deleteMany({
      where: { organizationId: { in: [organizationAId, organizationBId] } },
    });
    await prisma.session.deleteMany({
      where: { organizationId: { in: [organizationAId, organizationBId] } },
    });
    await prisma.user.updateMany({
      where: { id: { in: [userA.id, userB.id] } },
      data: {
        status: UserStatus.ACTIVE,
        passwordHash: originalPasswordHash,
      },
    });
    await prisma.organization.updateMany({
      where: { id: { in: [organizationAId, organizationBId] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
  });

  afterAll(async () => {
    if (prisma && organizationAId && organizationBId) {
      await prisma.passwordResetToken.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.session.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.user.deleteMany({
        where: { organizationId: { in: [organizationAId, organizationBId] } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationAId, organizationBId] } },
      });
    }

    await app?.close();
  });

  it('normalizes e-mail, creates a tenant-scoped session and never returns tokens', async () => {
    const response = await login(`  ${userA.email.toUpperCase()}  `);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(responseBody(response)).toEqual({
      user: {
        id: userA.id,
        name: 'Auth Owner A',
        email: userA.displayEmail,
        role: 'OWNER',
      },
      organization: {
        id: organizationAId,
        name: 'Auth tenant A',
        timezone: 'America/Sao_Paulo',
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/token|password|hash/i);

    const cookies = setCookieHeaders(response);
    expectCookieSecurity(cookies, accessCookieName, '/');
    expectCookieSecurity(cookies, refreshCookieName, '/api/v1/auth');
    expect(cookies.join(';')).not.toContain('Secure');

    const refreshCookie = cookiePair(cookies, refreshCookieName);
    const rawRefreshToken = refreshCookie.slice(refreshCookie.indexOf('=') + 1);
    const session = await prisma.session.findFirstOrThrow({
      where: { organizationId: organizationAId, userId: userA.id },
    });

    expect(session.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(session.refreshTokenHash).not.toBe(rawRefreshToken);
    expect(session.organizationId).toBe(organizationAId);
  });

  it('returns the same accepted response without revealing whether an e-mail exists', async () => {
    const known = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .set('Origin', allowedOrigin)
      .send({ email: `  ${userA.email.toUpperCase()}  ` })
      .expect(202);
    const unknown = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .set('Origin', allowedOrigin)
      .send({ email: 'unknown-password-reset@example.test' })
      .expect(202);
    await passwordResetService.onApplicationShutdown();

    expect(responseBody(known)).toEqual(responseBody(unknown));
    expect(responseBody(known)).toEqual({
      message:
        'Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação.',
    });
    expect(emailGateway.messages).toHaveLength(1);

    const resetToken = tokenFromResetUrl(emailGateway.messages[0]?.resetUrl);
    const persisted = await prisma.passwordResetToken.findMany({
      where: { organizationId: userA.organizationId, userId: userA.id },
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(persisted[0]?.tokenHash).not.toBe(resetToken);
  });

  it('resets the password once and revokes every existing session in that tenant', async () => {
    const firstSession = await createSession(userA);
    const secondSession = await createSession(userA);

    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .set('Origin', allowedOrigin)
      .send({ email: userA.email })
      .expect(202);
    await passwordResetService.onApplicationShutdown();
    const resetToken = tokenFromResetUrl(emailGateway.messages[0]?.resetUrl);

    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .set('Origin', allowedOrigin)
      .send({ token: resetToken, password: 'CicleraResetTest!2026' })
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', `${accessCookieName}=${firstSession.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', `${accessCookieName}=${secondSession.accessToken}`)
      .expect(401);

    const revokedSessions = await prisma.session.findMany({
      where: { organizationId: userA.organizationId, userId: userA.id },
      select: { revokedAt: true, revocationReason: true },
    });
    expect(revokedSessions).not.toHaveLength(0);
    expect(
      revokedSessions.every(
        (session) =>
          session.revokedAt !== null &&
          session.revocationReason === 'PASSWORD_RESET',
      ),
    ).toBe(true);

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: userA.id },
      select: { passwordHash: true },
    });
    await expect(verify(updatedUser.passwordHash, testPassword)).resolves.toBe(
      false,
    );
    await expect(
      verify(updatedUser.passwordHash, 'CicleraResetTest!2026'),
    ).resolves.toBe(true);

    const reused = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .set('Origin', allowedOrigin)
      .send({ token: resetToken, password: 'AnotherResetTest!2026' })
      .expect(400);
    expect(responseBody(reused)).toMatchObject({
      code: 'INVALID_PASSWORD_RESET_TOKEN',
      status: 400,
    });
  });

  it('rejects invalid, expired and superseded reset tokens with the same safe error', async () => {
    const invalid = await resetPassword(
      'x'.repeat(43),
      'NewPassword!2026',
      400,
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .set('Origin', allowedOrigin)
      .send({ email: userA.email })
      .expect(202);
    await passwordResetService.onApplicationShutdown();
    const firstToken = tokenFromResetUrl(emailGateway.messages[0]?.resetUrl);
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .set('Origin', allowedOrigin)
      .send({ email: userA.email })
      .expect(202);
    await passwordResetService.onApplicationShutdown();
    const secondToken = tokenFromResetUrl(emailGateway.messages[1]?.resetUrl);
    const superseded = await resetPassword(firstToken, 'NewPassword!2026', 400);

    const latest = await prisma.passwordResetToken.findFirstOrThrow({
      where: { organizationId: userA.organizationId, userId: userA.id },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.passwordResetToken.update({
      where: { id: latest.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const expired = await resetPassword(secondToken, 'NewPassword!2026', 400);

    for (const response of [invalid, superseded, expired]) {
      expect(responseBody(response)).toMatchObject({
        code: 'INVALID_PASSWORD_RESET_TOKEN',
        status: 400,
      });
      expect(JSON.stringify(responseBody(response))).not.toContain(userA.id);
      expect(JSON.stringify(responseBody(response))).not.toContain(
        userA.organizationId,
      );
    }
  });

  it('allows only one concurrent password reset to consume a token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .set('Origin', allowedOrigin)
      .send({ email: userB.email })
      .expect(202);
    await passwordResetService.onApplicationShutdown();
    const resetToken = tokenFromResetUrl(emailGateway.messages[0]?.resetUrl);

    const responses = await Promise.all([
      resetPassword(resetToken, 'ConcurrentResetA!2026'),
      resetPassword(resetToken, 'ConcurrentResetB!2026'),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      204, 400,
    ]);

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: userB.id },
      select: { passwordHash: true },
    });
    const matches = await Promise.all([
      verify(updatedUser.passwordHash, 'ConcurrentResetA!2026'),
      verify(updatedUser.passwordHash, 'ConcurrentResetB!2026'),
    ]);
    expect(matches.filter(Boolean)).toHaveLength(1);
  });

  it('keeps the complete public contract equivalent for active, unknown and inactive identities when delivery is available', async () => {
    const active = await forgotPassword(userA.email, 202);
    const unknown = await forgotPassword('available-unknown@example.test', 202);

    await prisma.user.update({
      where: { id: userB.id },
      data: { status: UserStatus.INACTIVE },
    });
    const inactiveUser = await forgotPassword(userB.email, 202);

    await prisma.organization.update({
      where: { id: organizationBId },
      data: { status: OrganizationStatus.INACTIVE },
    });
    await prisma.user.update({
      where: { id: userB.id },
      data: { status: UserStatus.ACTIVE },
    });
    const inactiveOrganization = await forgotPassword(userB.email, 202);
    await passwordResetService.onApplicationShutdown();

    const contracts = [active, unknown, inactiveUser, inactiveOrganization].map(
      forgotPasswordPublicContract,
    );
    expect(contracts).toEqual([
      contracts[0],
      contracts[0],
      contracts[0],
      contracts[0],
    ]);
    expect(emailGateway.messages).toHaveLength(1);
    expect(deliveryObserver.failures).toEqual([]);
    expect(
      await prisma.passwordResetToken.count({
        where: { organizationId: userA.organizationId, userId: userA.id },
      }),
    ).toBe(1);
    expect(
      await prisma.passwordResetToken.count({
        where: { organizationId: userB.organizationId, userId: userB.id },
      }),
    ).toBe(0);
  });

  it.each(['disabled', 'unavailable'] as const)(
    'returns the same complete 503 contract before identity lookup when the gateway is %s',
    async (availability) => {
      emailGateway.availability = availability;

      const known = await forgotPassword(userA.email, 503);
      const unknown = await forgotPassword(
        `${availability}-unknown@example.test`,
        503,
      );

      expect(forgotPasswordPublicContract(known)).toEqual(
        forgotPasswordPublicContract(unknown),
      );
      expect(responseBody(known)).toMatchObject({
        code: 'PASSWORD_RESET_UNAVAILABLE',
        title: 'Recuperação indisponível',
        detail: 'Não foi possível enviar as instruções de recuperação.',
      });
      expect(emailGateway.messages).toHaveLength(0);
      expect(deliveryObserver.failures).toEqual([]);
      expect(
        await prisma.passwordResetToken.count({
          where: { organizationId: userA.organizationId, userId: userA.id },
        }),
      ).toBe(0);
    },
  );

  it('keeps send-time failure indistinguishable from an unknown identity and invalidates the undelivered token', async () => {
    emailGateway.failDeliveries = true;

    const known = await forgotPassword(userA.email, 202);
    const unknown = await forgotPassword(
      'delivery-failure-unknown@example.test',
      202,
    );
    await passwordResetService.onApplicationShutdown();

    expect(forgotPasswordPublicContract(known)).toEqual(
      forgotPasswordPublicContract(unknown),
    );
    expect(deliveryObserver.failures).toEqual(['delivery']);
    expect(emailGateway.messages).toHaveLength(0);
    const failedDeliveryToken = await prisma.passwordResetToken.findFirst({
      where: { organizationId: userA.organizationId, userId: userA.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(failedDeliveryToken?.usedAt).not.toBeNull();
  });

  it('does not issue tokens for inactive users', async () => {
    await prisma.user.update({
      where: { id: userA.id },
      data: { status: UserStatus.INACTIVE },
    });

    await forgotPassword(userA.email, 202);
    await passwordResetService.onApplicationShutdown();
    expect(emailGateway.messages).toHaveLength(0);
    expect(
      await prisma.passwordResetToken.count({
        where: { organizationId: userA.organizationId, userId: userA.id },
      }),
    ).toBe(0);
  });

  it('rejects unsafe reset inputs and origins before changing credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .set('Origin', allowedOrigin)
      .send({ email: userA.email, organizationId: userB.organizationId })
      .expect(422);
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: userA.email })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .set('Origin', allowedOrigin)
      .send({ token: 'invalid', password: 'short' })
      .expect(422);
  });

  it('returns the same generic error for an unknown e-mail, wrong password and inactive identity', async () => {
    const unknown = await login(
      'unknown-auth-user@example.test',
      'wrong-password',
    );
    const wrongPassword = await login(userA.email, 'wrong-password');
    await prisma.user.update({
      where: { id: userA.id },
      data: { status: UserStatus.INACTIVE },
    });
    const inactive = await login(userA.email);
    await prisma.user.update({
      where: { id: userA.id },
      data: { status: UserStatus.ACTIVE },
    });
    await prisma.organization.update({
      where: { id: organizationAId },
      data: { status: OrganizationStatus.INACTIVE },
    });
    const inactiveOrganization = await login(userA.email);

    for (const response of [
      unknown,
      wrongPassword,
      inactive,
      inactiveOrganization,
    ]) {
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        title: 'Falha na autenticação',
        detail: 'E-mail, senha ou sessão inválidos.',
      });
      expect(JSON.stringify(response.body)).not.toContain(userA.id);
      expect(response.headers).not.toHaveProperty('set-cookie');
    }
  });

  it('resolves /auth/me only from a valid access cookie and trusted tenant context', async () => {
    const loginA = await login(userA.email);
    const loginB = await login(userB.email);
    const accessA = cookiePair(setCookieHeaders(loginA), accessCookieName);
    const accessB = cookiePair(setCookieHeaders(loginB), accessCookieName);

    const meA = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', accessA)
      .expect(200);
    const meB = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', accessB)
      .expect(200);

    expect(responseBody(meA)).toMatchObject({
      organization: { id: organizationAId },
    });
    expect(responseBody(meB)).toMatchObject({
      organization: { id: organizationBId },
    });

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessA.split('=', 2)[1]}`)
      .expect(401);

    const tampered = `${accessA.slice(0, -1)}x`;
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', tampered)
      .expect(401);

    const missingSessionToken = await accessTokens.issue({
      sessionId: randomUUID(),
      userId: userA.id,
      organizationId: organizationAId,
    });
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', `${accessCookieName}=${missingSessionToken}`)
      .expect(401);
  });

  it('rotates refresh tokens and revokes the whole family when an old token is reused', async () => {
    const signedIn = await login(userA.email);
    const initialRefresh = cookiePair(
      setCookieHeaders(signedIn),
      refreshCookieName,
    );

    const refreshed = await postRefresh(initialRefresh).expect(204);
    expect(refreshed.body).toEqual({});
    const nextCookies = setCookieHeaders(refreshed);
    const nextAccess = cookiePair(nextCookies, accessCookieName);
    const nextRefresh = cookiePair(nextCookies, refreshCookieName);
    expect(nextRefresh).not.toBe(initialRefresh);

    await postRefresh(initialRefresh).expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', nextAccess)
      .expect(401);

    const family = await prisma.session.findMany({
      where: { organizationId: organizationAId, userId: userA.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(family).toHaveLength(2);
    expect(family.every((session) => session.revokedAt !== null)).toBe(true);
    expect(family[1]?.revocationReason).toBe('REFRESH_TOKEN_REUSE_DETECTED');
  });

  it('rejects expired and revoked refresh sessions without exposing their state', async () => {
    const expired = await createSession(userA, {
      expiresAt: new Date(Date.now() - 1_000),
    });
    const revoked = await createSession(userB, {
      revokedAt: new Date(),
      revocationReason: 'TEST_REVOKED',
    });

    const expiredResponse = await postRefresh(
      `${refreshCookieName}=${expired.token}`,
    ).expect(401);
    const revokedResponse = await postRefresh(
      `${refreshCookieName}=${revoked.token}`,
    ).expect(401);

    expect(responseBody(expiredResponse)).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      detail: 'E-mail, senha ou sessão inválidos.',
    });
    expect(responseBody(revokedResponse)).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      detail: 'E-mail, senha ou sessão inválidos.',
    });
  });

  it('allows only one concurrent refresh and revokes the winner after reuse detection', async () => {
    const current = await createSession(userA);
    const cookie = `${refreshCookieName}=${current.token}`;

    const responses = await Promise.all([
      postRefresh(cookie),
      postRefresh(cookie),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      204, 401,
    ]);

    const successful = responses.find((response) => response.status === 204);
    if (!successful) {
      throw new Error('One concurrent refresh must succeed.');
    }

    const winnerAccess = cookiePair(
      setCookieHeaders(successful),
      accessCookieName,
    );
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', winnerAccess)
      .expect(401);
  });

  it('logs out the current session, remains idempotent and clears both cookies', async () => {
    const signedIn = await login(userA.email);
    const cookies = setCookieHeaders(signedIn);
    const access = cookiePair(cookies, accessCookieName);
    const refresh = cookiePair(cookies, refreshCookieName);

    const loggedOut = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', allowedOrigin)
      .set('Cookie', refresh)
      .expect(204);

    const cleared = setCookieHeaders(loggedOut);
    expectClearedCookie(cleared, accessCookieName, '/');
    expectClearedCookie(cleared, refreshCookieName, '/api/v1/auth');
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', access)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', allowedOrigin)
      .expect(204);
  });

  it('revokes all sessions only for the authenticated user and tenant', async () => {
    const firstA = await login(userA.email);
    const secondA = await login(userA.email);
    const signedInB = await login(userB.email);
    const accessA1 = cookiePair(setCookieHeaders(firstA), accessCookieName);
    const accessA2 = cookiePair(setCookieHeaders(secondA), accessCookieName);
    const accessB = cookiePair(setCookieHeaders(signedInB), accessCookieName);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('Origin', allowedOrigin)
      .set('Cookie', accessA1)
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', accessA1)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', accessA2)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', accessB)
      .expect(200);
  });

  it('rejects refresh after the user or organization becomes inactive', async () => {
    const userSession = await createSession(userA);
    await prisma.user.update({
      where: { id: userA.id },
      data: { status: UserStatus.INACTIVE },
    });
    await postRefresh(`${refreshCookieName}=${userSession.token}`).expect(401);

    await prisma.user.update({
      where: { id: userA.id },
      data: { status: UserStatus.ACTIVE },
    });
    const organizationSession = await createSession(userA);
    await prisma.organization.update({
      where: { id: organizationAId },
      data: { status: OrganizationStatus.INACTIVE },
    });
    await postRefresh(
      `${refreshCookieName}=${organizationSession.token}`,
    ).expect(401);
  });

  it('rejects unexpected login fields and unsafe request origins', async () => {
    const invalidBody = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', allowedOrigin)
      .send({
        email: userA.email,
        password: testPassword,
        organizationId: organizationBId,
      })
      .expect(422);
    expect(responseBody(invalidBody)).toMatchObject({
      fieldErrors: { organizationId: ['Campo não permitido.'] },
    });

    const invalidPayload = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', allowedOrigin)
      .send({ email: 'not-an-email', password: 'short' })
      .expect(422);
    expect(responseBody(invalidPayload)).toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    const invalidPayloadJson = JSON.stringify(responseBody(invalidPayload));
    expect(invalidPayloadJson).toContain('"email"');
    expect(invalidPayloadJson).toContain('"password"');

    const missingOrigin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: userA.email, password: testPassword })
      .expect(403);
    const untrustedOrigin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://untrusted.example')
      .send({ email: userA.email, password: testPassword })
      .expect(403);
    expect(responseBody(missingOrigin)).toMatchObject({
      code: 'ORIGIN_NOT_ALLOWED',
    });
    expect(responseBody(untrustedOrigin)).toMatchObject({
      code: 'ORIGIN_NOT_ALLOWED',
    });
  });

  it('rate limits login, refresh and password recovery without storing raw identifiers', async () => {
    const loginAttempts: SupertestResponse[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      loginAttempts.push(
        await login('rate-limited-auth-user@example.test', 'wrong-password'),
      );
    }
    expect(loginAttempts.map((response) => response.status).sort()).toEqual([
      401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 429,
    ]);
    expect(
      loginAttempts.find((response) => response.status === 429)?.body,
    ).toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });

    const invalidRefresh = refreshTokens.create();
    const refreshAttempts: SupertestResponse[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      refreshAttempts.push(
        await postRefresh(`${refreshCookieName}=${invalidRefresh.token}`),
      );
    }
    expect(
      refreshAttempts.slice(0, 10).every((response) => response.status === 401),
    ).toBe(true);
    expect(refreshAttempts[10]?.status).toBe(429);
    const limitedRefresh = refreshAttempts[10];
    if (!limitedRefresh) {
      throw new Error('Expected the eleventh refresh attempt.');
    }
    expect(responseBody(limitedRefresh)).toMatchObject({
      code: 'RATE_LIMITED',
    });

    const forgotAttempts: SupertestResponse[] = [];
    const forgotEmail = `rate-limited-reset-${Date.now()}@example.test`;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      forgotAttempts.push(
        await request(app.getHttpServer())
          .post('/api/v1/auth/forgot-password')
          .set('Origin', allowedOrigin)
          .send({ email: forgotEmail }),
      );
    }
    expect(
      forgotAttempts.slice(0, 10).every((response) => response.status === 202),
    ).toBe(true);
    expect(forgotAttempts[10]?.status).toBe(429);
    await passwordResetService.onApplicationShutdown();

    const resetAttempts: SupertestResponse[] = [];
    const invalidResetToken = 'z'.repeat(43);
    for (let attempt = 0; attempt < 11; attempt += 1) {
      resetAttempts.push(
        await request(app.getHttpServer())
          .post('/api/v1/auth/reset-password')
          .set('Origin', allowedOrigin)
          .send({ token: invalidResetToken, password: 'NewPassword!2026' }),
      );
    }
    expect(
      resetAttempts.slice(0, 10).every((response) => response.status === 400),
    ).toBe(true);
    expect(resetAttempts[10]?.status).toBe(429);
  }, 30_000);

  function login(
    email: string,
    password = testPassword,
    expectedStatus?: number,
  ): Promise<SupertestResponse> {
    const test = request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', allowedOrigin)
      .send({ email, password });

    return expectedStatus === undefined ? test : test.expect(expectedStatus);
  }

  function resetPassword(
    token: string,
    password: string,
    expectedStatus?: number,
  ): Promise<SupertestResponse> {
    const test = request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .set('Origin', allowedOrigin)
      .send({ token, password });

    return expectedStatus === undefined ? test : test.expect(expectedStatus);
  }

  function forgotPassword(
    email: string,
    expectedStatus?: number,
  ): Promise<SupertestResponse> {
    const test = request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .set('Origin', allowedOrigin)
      .send({ email });

    return expectedStatus === undefined ? test : test.expect(expectedStatus);
  }

  function postRefresh(cookie: string): request.Test {
    return request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', allowedOrigin)
      .set('Cookie', cookie);
  }

  async function createSession(
    identity: TestIdentity,
    overrides: {
      expiresAt?: Date;
      revokedAt?: Date;
      revocationReason?: string;
    } = {},
  ): Promise<{ token: string; accessToken: string }> {
    const refresh = refreshTokens.create();
    const resolvedSession = {
      sessionId: refresh.sessionId,
      userId: identity.id,
      organizationId: identity.organizationId,
    };
    await prisma.session.create({
      data: {
        id: refresh.sessionId,
        organizationId: identity.organizationId,
        userId: identity.id,
        familyId: randomUUID(),
        refreshTokenHash: refresh.tokenHash,
        expiresAt:
          overrides.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1_000),
        revokedAt: overrides.revokedAt,
        revocationReason: overrides.revocationReason,
      },
    });

    return {
      token: refresh.token,
      accessToken: await accessTokens.issue(resolvedSession),
    };
  }
});

function forgotPasswordPublicContract(
  response: SupertestResponse,
): Record<string, unknown> {
  const requestId: unknown = response.headers['x-request-id'];
  expect(requestId).toEqual(expect.stringMatching(/^req_[0-9a-f-]{36}$/));
  const body = { ...responseBody(response) };

  if (typeof body.requestId === 'string') {
    expect(body.requestId).toBe(requestId);
    body.requestId = '<request-id>';
  }

  return {
    status: response.status,
    body,
    headers: {
      cacheControl: response.headers['cache-control'],
      contentType: response.headers['content-type'],
      corsOrigin: response.headers['access-control-allow-origin'],
      corsCredentials: response.headers['access-control-allow-credentials'],
      requestId: '<request-id>',
      hasSetCookie: response.headers['set-cookie'] !== undefined,
    },
  };
}

function setCookieHeaders(response: SupertestResponse): string[] {
  const value: unknown = response.headers['set-cookie'];

  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }

  if (typeof value === 'string') {
    return [value];
  }

  return [];
}

function responseBody(response: SupertestResponse): Record<string, unknown> {
  const value: unknown = response.body;

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a JSON object response body.');
  }

  return value as Record<string, unknown>;
}

function cookiePair(cookies: readonly string[], name: string): string {
  const cookie = cookies.find((candidate) => candidate.startsWith(`${name}=`));

  if (!cookie) {
    throw new Error(`Expected ${name} cookie.`);
  }

  return cookie.split(';', 1)[0] ?? '';
}

function expectCookieSecurity(
  cookies: readonly string[],
  name: string,
  path: string,
): void {
  const cookie = cookies.find((candidate) => candidate.startsWith(`${name}=`));
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
  expect(cookie).toContain(`Path=${path}`);
  expect(cookie).toMatch(/Max-Age=\d+/);
}

function expectClearedCookie(
  cookies: readonly string[],
  name: string,
  path: string,
): void {
  const cookie = cookies.find((candidate) => candidate.startsWith(`${name}=`));
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
  expect(cookie).toContain(`Path=${path}`);
  expect(cookie).toContain('Max-Age=0');
  expect(cookie).toMatch(/Expires=[^;]+GMT/);
}

function databaseNameFromTestUrl(): string {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL must be set for authentication tests.');
  }

  return decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
}

function tokenFromResetUrl(value: string | undefined): string {
  if (!value) {
    throw new Error('Expected a password reset URL.');
  }

  const token = new URLSearchParams(new URL(value).hash.slice(1)).get('token');

  if (!token) {
    throw new Error('Expected a password reset token in the URL fragment.');
  }

  return token;
}

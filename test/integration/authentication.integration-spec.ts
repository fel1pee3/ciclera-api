import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationStatus, UserRole, UserStatus } from '@prisma/client';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import request, { Response as SupertestResponse } from 'supertest';
import { configureApplication } from '../../src/application';
import { AppModule } from '../../src/app.module';
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

describe('Authentication flow', () => {
  let moduleRef: TestingModule;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let accessTokens: AccessTokenService;
  let refreshTokens: RefreshTokenService;
  let organizationAId: string;
  let organizationBId: string;
  let userA: TestIdentity;
  let userB: TestIdentity;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
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

    const passwordHash = await hash(testPassword);
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
        passwordHash,
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
        passwordHash,
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
    await prisma.session.deleteMany({
      where: { organizationId: { in: [organizationAId, organizationBId] } },
    });
    await prisma.user.updateMany({
      where: { id: { in: [userA.id, userB.id] } },
      data: { status: UserStatus.ACTIVE },
    });
    await prisma.organization.updateMany({
      where: { id: { in: [organizationAId, organizationBId] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
  });

  afterAll(async () => {
    if (prisma && organizationAId && organizationBId) {
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

  it('rate limits login by normalized identifier and refresh by opaque session id', async () => {
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
  });

  function login(
    email: string,
    password = testPassword,
  ): Promise<SupertestResponse> {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', allowedOrigin)
      .send({ email, password });
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

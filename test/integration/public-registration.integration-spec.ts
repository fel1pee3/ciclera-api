import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import { verify } from 'argon2';
import { randomUUID } from 'node:crypto';
import request, { type Response as SupertestResponse } from 'supertest';
import { configureApplication } from '../../src/application';
import { AppModule } from '../../src/app.module';
import {
  PUBLIC_REGISTRATION_REPOSITORY,
  type PublicRegistrationRepository,
} from '../../src/auth/application/ports/public-registration.repository';
import { currentLegalVersion } from '../../src/auth/application/public-registration.service';
import {
  accessCookieName,
  refreshCookieName,
} from '../../src/auth/http/auth-cookies';
import { readEnvironment } from '../../src/config/environment';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';

const allowedOrigin = 'http://localhost:3000';
const password = 'LocalOnly!2026';

describe('Public registration persistence', () => {
  let moduleRef: TestingModule;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let repository: PublicRegistrationRepository;
  const organizationIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    repository = moduleRef.get(PUBLIC_REGISTRATION_REPOSITORY);

    const [connection] = await prisma.$queryRaw<
      Array<{ databaseName: string }>
    >`
      SELECT current_database() AS "databaseName"
    `;
    if (connection?.databaseName !== databaseNameFromTestUrl()) {
      throw new Error(
        'Registration tests connected to an unexpected database.',
      );
    }

    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApplication(app, {
      ...readEnvironment(moduleRef.get(ConfigService)),
      NODE_ENV: 'test',
    });
    await app.init();
  });

  afterEach(async () => {
    await cleanOrganizations(organizationIds.splice(0));
  });

  afterAll(async () => {
    await cleanOrganizations(organizationIds.splice(0));
    await app?.close();
  });

  it('atomically creates the tenant, OWNER, defaults, acceptance, session and audit', async () => {
    const email = uniqueEmail('success');
    const response = await register(`  ${email.toUpperCase()}  `).expect(201);
    const organizationId = registrationBody(response).organization.id;
    organizationIds.push(organizationId);

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: {
        users: true,
        workOrderCounter: true,
        legalAcceptances: true,
        auditLogs: true,
      },
    });
    const owner = organization.users[0];
    expect(owner).toMatchObject({
      role: 'OWNER',
      status: 'ACTIVE',
      email,
      normalizedEmail: email,
    });
    await expect(verify(owner?.passwordHash ?? '', password)).resolves.toBe(
      true,
    );
    expect(organization.workOrderCounter?.lastNumber).toBe(0n);
    expect(organization.legalAcceptances).toHaveLength(1);
    expect(organization.legalAcceptances[0]).toMatchObject({
      termsVersion: currentLegalVersion,
      privacyVersion: currentLegalVersion,
    });
    expect(organization.auditLogs).toHaveLength(1);
    expect(organization.auditLogs[0]?.metadata).toEqual({
      termsVersion: currentLegalVersion,
      privacyVersion: currentLegalVersion,
    });

    const session = await prisma.session.findFirstOrThrow({
      where: { organizationId },
    });
    expect(session.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(response.body)).not.toMatch(/password|token|hash/i);
    expect(cookie(response, accessCookieName)).toContain('HttpOnly');
    expect(cookie(response, refreshCookieName)).toContain('HttpOnly');

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', allowedOrigin)
      .send({ email: email.toUpperCase(), password })
      .expect(200);
    expect(login.body).toMatchObject({
      user: { email, role: 'OWNER' },
      organization: { id: organizationId },
    });
    expect(cookie(login, accessCookieName)).toContain('HttpOnly');
  });

  it('allows only one concurrent registration for the same normalized e-mail', async () => {
    const email = uniqueEmail('concurrent');
    const responses = await Promise.all([
      register(`  ${email.toUpperCase()}  `),
      register(email),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);

    const users = await prisma.user.findMany({
      where: { normalizedEmail: email },
      select: { organizationId: true },
    });
    expect(users).toHaveLength(1);
    const organizationId = users[0]?.organizationId;
    if (organizationId) organizationIds.push(organizationId);
  });

  it('keeps independently registered organizations isolated', async () => {
    const [first, second] = await Promise.all([
      register(uniqueEmail('tenant-a')),
      register(uniqueEmail('tenant-b')),
    ]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstId = registrationBody(first).organization.id;
    const secondId = registrationBody(second).organization.id;
    organizationIds.push(firstId, secondId);
    expect(firstId).not.toBe(secondId);
    await expect(
      prisma.user.count({ where: { organizationId: firstId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.user.count({ where: { organizationId: secondId } }),
    ).resolves.toBe(1);
  });

  it('rolls back every partial write when a late transaction step fails', async () => {
    const organizationId = randomUUID();
    const ownerId = randomUUID();

    await expect(
      repository.create({
        organizationId,
        organizationName: 'Rollback tenant',
        ownerId,
        ownerName: 'Rollback Owner',
        email: uniqueEmail('rollback'),
        normalizedEmail: uniqueEmail('rollback-normalized'),
        passwordHash: 'argon2-test-hash',
        timezone: 'America/Sao_Paulo',
        termsVersion: currentLegalVersion,
        privacyVersion: currentLegalVersion,
        acceptedAt: new Date(),
        sessionId: randomUUID(),
        familyId: randomUUID(),
        refreshTokenHash: 'b'.repeat(64),
        sessionExpiresAt: new Date(Date.now() + 60_000),
        requestId: 'x'.repeat(129),
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.organization.findUnique({ where: { id: organizationId } }),
    ).resolves.toBeNull();
    await expect(
      prisma.user.findUnique({ where: { id: ownerId } }),
    ).resolves.toBeNull();
  });

  function register(email: string): request.Test {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', allowedOrigin)
      .send({
        organizationName: 'Empresa Tecnica',
        ownerName: 'Maria Owner',
        email,
        password,
        timezone: 'America/Sao_Paulo',
        termsAccepted: true,
        termsVersion: currentLegalVersion,
      });
  }

  async function cleanOrganizations(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await prisma.auditLog.deleteMany({
      where: { organizationId: { in: ids } },
    });
    await prisma.session.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.legalAcceptance.deleteMany({
      where: { organizationId: { in: ids } },
    });
    await prisma.workOrderCounter.deleteMany({
      where: { organizationId: { in: ids } },
    });
    await prisma.user.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  }
});

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

function cookie(response: SupertestResponse, name: string): string {
  const values: unknown = response.headers['set-cookie'];
  if (!Array.isArray(values)) throw new Error(`Expected ${name} cookie.`);
  return String(values.find((value) => String(value).startsWith(`${name}=`)));
}

function registrationBody(response: SupertestResponse): {
  organization: { id: string };
} {
  const body: unknown = response.body;
  if (
    typeof body !== 'object' ||
    body === null ||
    !('organization' in body) ||
    typeof body.organization !== 'object' ||
    body.organization === null ||
    !('id' in body.organization) ||
    typeof body.organization.id !== 'string'
  ) {
    throw new Error('Expected a registration account response.');
  }
  return { organization: { id: body.organization.id } };
}

function databaseNameFromTestUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('TEST_DATABASE_URL is required.');
  return decodeURIComponent(new URL(value).pathname.slice(1));
}

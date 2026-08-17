import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import request, { type Response as SupertestResponse } from 'supertest';
import { configureApplication } from '../src/application';
import { AppModule } from '../src/app.module';
import { PublicRegistrationService } from '../src/auth/application/public-registration.service';
import {
  accessCookieName,
  refreshCookieName,
} from '../src/auth/http/auth-cookies';
import { PUBLIC_REGISTRATION_CONFIGURATION } from '../src/auth/http/public-registration.guard';
import { readEnvironment } from '../src/config/environment';

const allowedOrigin = 'http://localhost:3000';
const validInput = {
  organizationName: 'Empresa Tecnica',
  ownerName: 'Maria Owner',
  email: 'registration-e2e@example.test',
  password: 'LocalOnly!2026',
  termsAccepted: true,
  termsVersion: '2026-08-17',
};
const account = {
  user: {
    id: '10000000-0000-4000-8000-000000000101',
    name: 'Maria Owner',
    email: validInput.email,
    role: 'OWNER' as const,
  },
  organization: {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Empresa Tecnica',
    timezone: 'America/Sao_Paulo',
  },
};

describe('Public registration contract (e2e)', () => {
  let enabledModule: TestingModule;
  let disabledModule: TestingModule;
  let enabledApp: NestExpressApplication;
  let disabledApp: NestExpressApplication;
  const registrations = {
    register: jest.fn().mockResolvedValue({
      account,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    }),
  };

  beforeAll(async () => {
    enabledModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PublicRegistrationService)
      .useValue(registrations)
      .compile();
    enabledApp = await createApp(enabledModule);

    disabledModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PUBLIC_REGISTRATION_CONFIGURATION)
      .useValue({ enabled: false })
      .compile();
    disabledApp = await createApp(disabledModule);
  });

  afterAll(async () => {
    await enabledApp?.close();
    await disabledApp?.close();
  });

  it('returns the account, secure cookies and no token in the response body', async () => {
    const response = await register(enabledApp, validInput).expect(201);

    expect(response.body).toEqual(account);
    expect(JSON.stringify(response.body)).not.toMatch(/password|token|hash/i);
    const cookies = setCookieHeaders(response);
    expect(
      cookies.some((value) => value.startsWith(`${accessCookieName}=`)),
    ).toBe(true);
    expect(
      cookies.some((value) => value.startsWith(`${refreshCookieName}=`)),
    ).toBe(true);
    expect(cookies.every((value) => value.includes('HttpOnly'))).toBe(true);
  });

  it('rejects unsafe origins, non-JSON bodies and oversized payloads', async () => {
    await request(enabledApp.getHttpServer())
      .post('/api/v1/auth/register')
      .send(validInput)
      .expect(403);
    await request(enabledApp.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'https://untrusted.example')
      .send(validInput)
      .expect(403);
    await request(enabledApp.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', allowedOrigin)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(validInput))
      .expect(415);
    await register(enabledApp, {
      ...validInput,
      organizationName: 'x'.repeat(17_000),
    }).expect(413);
  });

  it('enforces the strict DTO and current legal acceptance', async () => {
    const response = await register(enabledApp, {
      ...validInput,
      termsAccepted: false,
      organizationId: account.organization.id,
    }).expect(422);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(response.text).toContain('organizationId');
    expect(response.text).toContain('termsAccepted');
  });

  it.each([
    ['short password', { password: 'short' }],
    ['password without uppercase', { password: 'localonly!2026' }],
    ['password without lowercase', { password: 'LOCALONLY!2026' }],
    ['password without number', { password: 'LocalOnly!Password' }],
    ['password without symbol', { password: 'LocalOnly2026' }],
    ['client-defined timezone', { timezone: 'America/Manaus' }],
    ['missing legal version', { termsVersion: undefined }],
  ])('rejects %s', async (_scenario, override) => {
    const response = await register(enabledApp, {
      ...validInput,
      email: `${String(_scenario).replace(/\s/g, '-')}@example.test`,
      ...override,
    }).expect(422);

    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('fails closed with a stable response when registration is disabled', async () => {
    const response = await register(disabledApp, validInput).expect(503);

    expect(response.body).toMatchObject({
      status: 503,
      code: 'PUBLIC_REGISTRATION_DISABLED',
    });
  });

  it('rate limits repeated attempts by normalized e-mail', async () => {
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await register(enabledApp, {
        ...validInput,
        email:
          attempt % 2 === 0
            ? ' Rate-Limited-Registration@Example.Test '
            : 'rate-limited-registration@example.test',
      });
      statuses.push(response.status);
    }

    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });
});

async function createApp(
  moduleRef: TestingModule,
): Promise<NestExpressApplication> {
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  configureApplication(app, {
    ...readEnvironment(moduleRef.get(ConfigService)),
    NODE_ENV: 'test',
  });
  await app.init();
  return app;
}

function register(app: NestExpressApplication, body: object): request.Test {
  return request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .set('Origin', allowedOrigin)
    .send(body);
}

function setCookieHeaders(response: SupertestResponse): string[] {
  const value: unknown = response.headers['set-cookie'];
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : [];
}

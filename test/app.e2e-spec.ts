import { Body, Controller, Get, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { IsString, MinLength } from 'class-validator';
import request from 'supertest';
import { configureApplication } from '../src/application';
import { AppModule } from '../src/app.module';
import { Public } from '../src/auth/http/public.decorator';
import { NodeEnvironment, readEnvironment } from '../src/config/environment';
import { DatabaseHealthService } from '../src/health/database-health.service';

class TestOnlyDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

@Public()
@Controller('test-only')
class TestOnlyController {
  @Get('prefix')
  prefix(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Post('validation')
  validation(@Body() body: TestOnlyDto): TestOnlyDto {
    return body;
  }

  @Get('unexpected-error')
  unexpectedError(): never {
    throw new Error('private-internal-error');
  }
}

describe('API foundation (e2e)', () => {
  let developmentApp: NestExpressApplication;
  let unavailableDatabaseApp: NestExpressApplication;
  let nonDevelopmentApp: NestExpressApplication;

  beforeAll(async () => {
    developmentApp = await createTestApplication('development');
    unavailableDatabaseApp = await createTestApplication('development', false);
    nonDevelopmentApp = await createTestApplication('production');
  });

  afterAll(async () => {
    await Promise.all([
      developmentApp.close(),
      unavailableDatabaseApp.close(),
      nonDevelopmentApp.close(),
    ]);
  });

  it('serves liveness outside the global API prefix', async () => {
    await request(developmentApp.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });

    await request(developmentApp.getHttpServer())
      .get('/api/v1/health/live')
      .expect(404);
  });

  it('reports readiness when PostgreSQL is available', async () => {
    await request(developmentApp.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({ status: 'ok', checks: { database: 'up' } });
  });

  it('returns a safe readiness error when PostgreSQL is unavailable', async () => {
    const response = await request(unavailableDatabaseApp.getHttpServer())
      .get('/health/ready')
      .expect(503);

    expect(response.body).toMatchObject({
      type: 'https://ciclera.com.br/problems/database-unavailable',
      title: 'Serviço indisponível',
      status: 503,
      detail: 'O banco de dados está temporariamente indisponível.',
      code: 'DATABASE_UNAVAILABLE',
    });
    expect(response.body).not.toHaveProperty('databaseUrl');
    expect(response.body).not.toHaveProperty('stack');
  });

  it('applies the /api/v1 prefix to ordinary controllers', async () => {
    await request(developmentApp.getHttpServer())
      .get('/api/v1/test-only/prefix')
      .expect(200)
      .expect({ status: 'ok' });

    await request(developmentApp.getHttpServer())
      .get('/test-only/prefix')
      .expect(404);
  });

  it('returns the centralized error format without internal details', async () => {
    const response = await request(developmentApp.getHttpServer())
      .get('/api/v1/test-only/unexpected-error')
      .expect(500);

    expect(response.body).toMatchObject({
      type: 'https://ciclera.com.br/problems/internal-server-error',
      title: 'Erro interno',
      status: 500,
      detail: 'Ocorreu um erro inesperado.',
      code: 'INTERNAL_SERVER_ERROR',
      requestId: response.headers['x-request-id'],
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'private-internal-error',
    );
    expect(response.body).not.toHaveProperty('stack');
  });

  it('returns a validated request ID and preserves a valid one', async () => {
    const generatedResponse = await request(developmentApp.getHttpServer())
      .get('/health/live')
      .set('x-request-id', 'invalid request id with spaces')
      .expect(200);

    expect(generatedResponse.headers['x-request-id']).toMatch(
      /^req_[0-9a-f-]{36}$/,
    );
    expect(generatedResponse.headers['x-request-id']).not.toBe(
      'invalid request id with spaces',
    );

    const preservedResponse = await request(developmentApp.getHttpServer())
      .get('/health/live')
      .set('x-request-id', 'trusted-client-id_123')
      .expect(200);

    expect(preservedResponse.headers['x-request-id']).toBe(
      'trusted-client-id_123',
    );
  });

  it('allows configured CORS origins with credentials', async () => {
    const response = await request(developmentApp.getHttpServer())
      .options('/health/live')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant CORS access to origins outside the allowlist', async () => {
    const response = await request(developmentApp.getHttpServer())
      .options('/health/live')
      .set('Origin', 'https://untrusted.example')
      .set('Access-Control-Request-Method', 'GET')
      .expect(404);

    expect(response.headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('rejects unexpected fields through the global ValidationPipe', async () => {
    const response = await request(developmentApp.getHttpServer())
      .post('/api/v1/test-only/validation')
      .send({ name: 'Ciclera', unexpected: true })
      .expect(422);

    expect(response.body).toMatchObject({
      type: 'https://ciclera.com.br/problems/validation-error',
      title: 'Dados inválidos',
      status: 422,
      detail: 'Revise os campos informados.',
      code: 'VALIDATION_ERROR',
      fieldErrors: { unexpected: ['Campo não permitido.'] },
      requestId: response.headers['x-request-id'],
    });
  });

  it('enforces the configured body size limit', async () => {
    const response = await request(developmentApp.getHttpServer())
      .post('/api/v1/test-only/validation')
      .send({ name: 'a'.repeat(101 * 1024) })
      .expect(413);

    expect(response.body).toMatchObject({
      type: 'https://ciclera.com.br/problems/payload-too-large',
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      requestId: response.headers['x-request-id'],
    });
  });

  it('adds basic security headers', async () => {
    const response = await request(developmentApp.getHttpServer())
      .get('/health/live')
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers).not.toHaveProperty('x-powered-by');
  });

  it('exposes Swagger only in development', async () => {
    const documentResponse = await request(developmentApp.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const documentBody: unknown = documentResponse.body;

    if (!isRecord(documentBody) || !isRecord(documentBody.paths)) {
      throw new Error('Swagger document must expose a paths object.');
    }

    expect(documentBody.paths).toHaveProperty('/health/live');
    expect(documentBody.paths).toHaveProperty('/health/ready');
    expect(documentBody.paths).toHaveProperty('/api/v1/auth/login');
    expect(documentBody.paths).toHaveProperty('/api/v1/auth/me');
    expect(documentBody.paths).toHaveProperty('/api/v1/auth/refresh');
    expect(documentBody.paths).toHaveProperty('/api/v1/auth/logout');
    expect(documentBody.paths).toHaveProperty('/api/v1/auth/logout-all');
    expect(documentBody.paths).toHaveProperty('/api/v1/auth/forgot-password');
    expect(documentBody.paths).toHaveProperty('/api/v1/auth/reset-password');

    await request(nonDevelopmentApp.getHttpServer())
      .get('/docs-json')
      .expect(404);
  });
});

async function createTestApplication(
  nodeEnvironment: NodeEnvironment,
  databaseReady?: boolean,
): Promise<NestExpressApplication> {
  let builder: TestingModuleBuilder = Test.createTestingModule({
    imports: [AppModule],
    controllers: [TestOnlyController],
  });

  if (databaseReady !== undefined) {
    builder = builder.overrideProvider(DatabaseHealthService).useValue({
      isReady: jest.fn().mockResolvedValue(databaseReady),
    });
  }

  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  const environment = readEnvironment(moduleFixture.get(ConfigService));

  configureApplication(app, {
    ...environment,
    NODE_ENV: nodeEnvironment,
  });
  await app.init();

  return app;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

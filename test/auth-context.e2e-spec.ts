import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AUTHENTICATED_USER_REPOSITORY } from '../src/auth/application/ports/authenticated-user.repository';
import type {
  AuthenticatedUser,
  AuthenticatedUserRepository,
} from '../src/auth/application/ports/authenticated-user.repository';
import { SESSION_RESOLVER } from '../src/auth/application/ports/session-resolver.port';
import type {
  ResolvedSession,
  SessionResolver,
} from '../src/auth/application/ports/session-resolver.port';
import type { AuthenticatedPrincipal } from '../src/auth/domain/authenticated-principal';
import { CurrentPrincipal } from '../src/auth/http/current-principal.decorator';
import { Roles } from '../src/auth/http/roles.decorator';
import { configureApplication } from '../src/application';
import { AppModule } from '../src/app.module';
import { readEnvironment } from '../src/config/environment';

@Controller('test-only/auth')
class TestAuthController {
  @Get('principal')
  principal(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): AuthenticatedPrincipal {
    return principal;
  }

  @Get('owner-only')
  @Roles('OWNER')
  ownerOnly(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('missing-resource')
  missingResource(): never {
    throw new NotFoundException();
  }
}

class TestSessionResolver implements SessionResolver {
  resolvedSession: ResolvedSession | null = null;

  resolveSession(): Promise<ResolvedSession | null> {
    return Promise.resolve(this.resolvedSession);
  }
}

class TestAuthenticatedUserRepository implements AuthenticatedUserRepository {
  resolvedUser: AuthenticatedUser | null = null;

  findById(): Promise<AuthenticatedUser | null> {
    return Promise.resolve(this.resolvedUser);
  }
}

describe('Authenticated context foundation (e2e)', () => {
  let app: NestExpressApplication;
  let sessionResolver: TestSessionResolver;
  let userRepository: TestAuthenticatedUserRepository;

  beforeAll(async () => {
    sessionResolver = new TestSessionResolver();
    userRepository = new TestAuthenticatedUserRepository();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestAuthController],
    })
      .overrideProvider(SESSION_RESOLVER)
      .useValue(sessionResolver)
      .overrideProvider(AUTHENTICATED_USER_REPOSITORY)
      .useValue(userRepository)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    const environment = readEnvironment(moduleFixture.get(ConfigService));

    configureApplication(app, { ...environment, NODE_ENV: 'test' });
    await app.init();
  });

  beforeEach(() => {
    sessionResolver.resolvedSession = null;
    userRepository.resolvedUser = null;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns the centralized 401 response when no session is resolved', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-only/auth/principal')
      .expect(401);

    expect(response.body).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      requestId: response.headers['x-request-id'],
    });
    expect(response.body).not.toHaveProperty('organizationId');
  });

  it('rejects an inactive user without exposing account details', async () => {
    sessionResolver.resolvedSession = activeSession;
    userRepository.resolvedUser = {
      ...activeOwner,
      status: 'INACTIVE',
    };

    const response = await request(app.getHttpServer())
      .get('/api/v1/test-only/auth/principal')
      .expect(401);

    expect(response.body).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(JSON.stringify(response.body)).not.toContain(activeOwner.id);
    expect(JSON.stringify(response.body)).not.toContain(
      activeOwner.organizationId,
    );
  });

  it('returns the same 401 response when the resolved user does not exist', async () => {
    sessionResolver.resolvedSession = activeSession;

    const response = await request(app.getHttpServer())
      .get('/api/v1/test-only/auth/principal')
      .expect(401);

    expect(response.body).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(JSON.stringify(response.body)).not.toContain(activeSession.userId);
  });

  it('rejects a user whose organization is inactive', async () => {
    sessionResolver.resolvedSession = activeSession;
    userRepository.resolvedUser = {
      ...activeOwner,
      organizationStatus: 'INACTIVE',
    };

    const response = await request(app.getHttpServer())
      .get('/api/v1/test-only/auth/principal')
      .expect(401);

    expect(response.body).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(JSON.stringify(response.body)).not.toContain(
      activeOwner.organizationId,
    );
  });

  it('exposes only the trusted authenticated principal through the decorator', async () => {
    sessionResolver.resolvedSession = activeSession;
    userRepository.resolvedUser = activeOwner;

    await request(app.getHttpServer())
      .get('/api/v1/test-only/auth/principal')
      .set('x-user-role', 'TECHNICIAN')
      .set('x-organization-id', 'untrusted-organization')
      .expect(200)
      .expect({
        userId: activeOwner.id,
        organizationId: activeOwner.organizationId,
        role: 'OWNER',
        sessionId: activeSession.sessionId,
      });
  });

  it('ignores a freely supplied role header and returns a consistent 403', async () => {
    sessionResolver.resolvedSession = activeSession;
    userRepository.resolvedUser = {
      ...activeOwner,
      role: 'TECHNICIAN',
    };

    const response = await request(app.getHttpServer())
      .get('/api/v1/test-only/auth/owner-only')
      .set('x-user-role', 'OWNER')
      .expect(403);

    expect(response.body).toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      requestId: response.headers['x-request-id'],
    });
  });

  it('preserves the centralized 404 response behind authentication', async () => {
    sessionResolver.resolvedSession = activeSession;
    userRepository.resolvedUser = activeOwner;

    const response = await request(app.getHttpServer())
      .get('/api/v1/test-only/auth/missing-resource')
      .expect(404);

    expect(response.body).toMatchObject({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      requestId: response.headers['x-request-id'],
    });
  });
});

const activeSession: ResolvedSession = {
  sessionId: '30000000-0000-4000-8000-000000000001',
  userId: '30000000-0000-4000-8000-000000000101',
  organizationId: '30000000-0000-4000-8000-000000000010',
};

const activeOwner: AuthenticatedUser = {
  id: activeSession.userId,
  organizationId: activeSession.organizationId,
  role: 'OWNER',
  status: 'ACTIVE',
  organizationStatus: 'ACTIVE',
};

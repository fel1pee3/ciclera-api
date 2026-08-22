import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/application';
import { AUTHENTICATED_USER_REPOSITORY } from '../src/auth/application/ports/authenticated-user.repository';
import type {
  AuthenticatedUser,
  AuthenticatedUserRepository,
} from '../src/auth/application/ports/authenticated-user.repository';
import { PASSWORD_HASHER } from '../src/auth/application/ports/password-hasher.port';
import type { PasswordHasher } from '../src/auth/application/ports/password-hasher.port';
import { SESSION_RESOLVER } from '../src/auth/application/ports/session-resolver.port';
import type {
  ResolvedSession,
  SessionResolver,
} from '../src/auth/application/ports/session-resolver.port';
import { readEnvironment } from '../src/config/environment';
import { USER_REPOSITORY } from '../src/users/application/ports/user.repository';
import type {
  CreateUserResult,
  ListUsersInput,
  PaginatedUsers,
  UpdateUserResult,
  UserRepository,
} from '../src/users/application/ports/user.repository';
import type { ManagedUser } from '../src/users/domain/managed-user';

describe('Users HTTP contract (e2e)', () => {
  let app: NestExpressApplication;
  let sessions: TestSessionResolver;
  let identities: TestAuthenticatedUserRepository;
  let users: TestUserRepository;

  beforeAll(async () => {
    sessions = new TestSessionResolver();
    identities = new TestAuthenticatedUserRepository();
    users = new TestUserRepository();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SESSION_RESOLVER)
      .useValue(sessions)
      .overrideProvider(AUTHENTICATED_USER_REPOSITORY)
      .useValue(identities)
      .overrideProvider(USER_REPOSITORY)
      .useValue(users)
      .overrideProvider(PASSWORD_HASHER)
      .useValue(new TestPasswordHasher())
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApplication(app, {
      ...readEnvironment(moduleRef.get(ConfigService)),
      NODE_ENV: 'test',
    });
    await app.init();
  });

  beforeEach(() => {
    sessions.resolvedSession = session;
    identities.resolvedUser = owner;
    users.lastListInput = null;
  });

  afterAll(async () => app?.close());

  it('lists only through the trusted tenant context and returns pagination', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/users?page=2&pageSize=10')
      .expect(200);

    expect(response.body).toEqual({
      items: [],
      page: 2,
      pageSize: 10,
      total: 0,
    });
    expect(users.lastListInput).toMatchObject({
      organizationId: owner.organizationId,
      page: 2,
      pageSize: 10,
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejects technicians before user management reaches the repository', async () => {
    identities.resolvedUser = { ...owner, role: 'TECHNICIAN' };

    const response = await request(app.getHttpServer())
      .get('/api/v1/users')
      .expect(403);
    expect(response.body).toMatchObject({
      code: 'FORBIDDEN',
      requestId: response.headers['x-request-id'],
    });
    expect(users.lastListInput).toBeNull();
  });

  it('enforces ADMIN target policy with a stable problem code', async () => {
    identities.resolvedUser = { ...owner, role: 'ADMIN' };

    const response = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        name: 'Outro administrador',
        email: 'another-admin@example.test',
        password: 'LocalOnly!2026',
        role: 'ADMIN',
      })
      .expect(403);
    expect(response.body).toMatchObject({
      code: 'USER_MANAGEMENT_FORBIDDEN',
      requestId: response.headers['x-request-id'],
    });
  });

  it('validates unknown fields and never returns a password or hash', async () => {
    const weakPassword = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        name: 'Técnica HTTP',
        email: 'http-tech@example.test',
        password: 'weakpassword',
        role: 'TECHNICIAN',
      })
      .expect(422);
    expect(weakPassword.body).toMatchObject({ code: 'VALIDATION_ERROR' });

    const invalid = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        name: 'Técnica HTTP',
        email: 'http-tech@example.test',
        password: 'LocalOnly!2026',
        role: 'TECHNICIAN',
        organizationId: 'untrusted',
      })
      .expect(422);
    expect(invalid.body).toMatchObject({ code: 'VALIDATION_ERROR' });

    const created = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        name: 'Técnica HTTP',
        email: 'http-tech@example.test',
        password: 'LocalOnly!2026',
        role: 'TECHNICIAN',
      })
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Técnica HTTP',
      email: 'http-tech@example.test',
      role: 'TECHNICIAN',
      status: 'ACTIVE',
    });
    expect(JSON.stringify(created.body)).not.toContain('password');
    expect(JSON.stringify(created.body)).not.toContain('hash');
  });

  it('rejects a weak password when updating access data', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/users/40000000-0000-4000-8000-000000000001')
      .send({ password: 'weakpassword' })
      .expect(422);

    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

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

class TestPasswordHasher implements PasswordHasher {
  hash(): Promise<string> {
    return Promise.resolve('test-only-password-hash');
  }
  verify(): Promise<boolean> {
    return Promise.resolve(false);
  }
  performDummyVerification(): Promise<void> {
    return Promise.resolve();
  }
}

class TestUserRepository implements UserRepository {
  lastListInput: ListUsersInput | null = null;

  list(input: ListUsersInput): Promise<PaginatedUsers> {
    this.lastListInput = input;
    return Promise.resolve({
      items: [],
      page: input.page,
      pageSize: input.pageSize,
      total: 0,
    });
  }

  findById(): Promise<ManagedUser | null> {
    return Promise.resolve(null);
  }

  create(
    input: Parameters<UserRepository['create']>[0],
  ): Promise<CreateUserResult> {
    return Promise.resolve({
      status: 'CREATED',
      user: {
        id: '40000000-0000-4000-8000-000000000001',
        name: input.name,
        email: input.email,
        role: input.role,
        status: 'ACTIVE',
        createdAt: new Date('2026-08-16T00:00:00.000Z'),
        updatedAt: new Date('2026-08-16T00:00:00.000Z'),
      },
    });
  }

  update(): Promise<UpdateUserResult> {
    return Promise.resolve({ status: 'NOT_FOUND' });
  }

  setStatus(): Promise<UpdateUserResult> {
    return Promise.resolve({ status: 'NOT_FOUND' });
  }

  deleteUser(): Promise<{ status: 'NOT_FOUND' }> {
    return Promise.resolve({ status: 'NOT_FOUND' });
  }
}

const session: ResolvedSession = {
  sessionId: '30000000-0000-4000-8000-000000000001',
  userId: '30000000-0000-4000-8000-000000000101',
  organizationId: '30000000-0000-4000-8000-000000000010',
};
const owner: AuthenticatedUser = {
  id: session.userId,
  organizationId: session.organizationId,
  role: 'OWNER',
  status: 'ACTIVE',
  organizationStatus: 'ACTIVE',
};

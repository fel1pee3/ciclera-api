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
import { SESSION_RESOLVER } from '../src/auth/application/ports/session-resolver.port';
import type {
  ResolvedSession,
  SessionResolver,
} from '../src/auth/application/ports/session-resolver.port';
import { readEnvironment } from '../src/config/environment';
import { CUSTOMER_REPOSITORY } from '../src/customers/application/ports/customer.repository';
import type {
  CustomerRepository,
  CustomerWriteResult,
  LocationWriteResult,
} from '../src/customers/application/ports/customer.repository';

describe('Customers HTTP contract (e2e)', () => {
  let app: NestExpressApplication;
  let identities: TestIdentityRepository;
  let repository: TestCustomerRepository;

  beforeAll(async () => {
    identities = new TestIdentityRepository();
    repository = new TestCustomerRepository();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SESSION_RESOLVER)
      .useValue(new TestSessionResolver())
      .overrideProvider(AUTHENTICATED_USER_REPOSITORY)
      .useValue(identities)
      .overrideProvider(CUSTOMER_REPOSITORY)
      .useValue(repository)
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
    identities.user = activeOwner;
    repository.listOrganizationId = null;
  });

  afterAll(async () => app?.close());

  it('paginates through the organization from the trusted principal', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/customers?page=3&pageSize=5&archive=ALL')
      .expect(200);
    expect(response.body).toEqual({
      items: [],
      page: 3,
      pageSize: 5,
      total: 0,
    });
    expect(repository.listOrganizationId).toBe(activeOwner.organizationId);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejects technician access and untrusted tenant fields', async () => {
    identities.user = { ...activeOwner, role: 'TECHNICIAN' };
    await request(app.getHttpServer()).get('/api/v1/customers').expect(403);

    identities.user = activeOwner;
    const response = await request(app.getHttpServer())
      .post(`/api/v1/customers/${customerId}/locations`)
      .send({
        name: 'Unidade',
        postalCode: '01000-000',
        street: 'Rua Teste',
        number: '1',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        organizationId: 'untrusted',
      })
      .expect(422);
    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('exposes create and archive contracts without a delete endpoint', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/customers')
      .send({ name: 'Cliente HTTP', document: '12.345.678/0001-90' })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({ id: customerId, name: 'Cliente HTTP' });
        expect(body).not.toHaveProperty('normalizedDocument');
        expect(body).not.toHaveProperty('organizationId');
      });
    await request(app.getHttpServer())
      .post(`/api/v1/customers/${customerId}/archive`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/customers/${customerId}`)
      .expect(404);
  });
});

class TestSessionResolver implements SessionResolver {
  resolveSession(): Promise<ResolvedSession> {
    return Promise.resolve(session);
  }
}

class TestIdentityRepository implements AuthenticatedUserRepository {
  user: AuthenticatedUser | null = activeOwner;
  findById(): Promise<AuthenticatedUser | null> {
    return Promise.resolve(this.user);
  }
}

class TestCustomerRepository implements CustomerRepository {
  listOrganizationId: string | null = null;
  listCustomers(input: Parameters<CustomerRepository['listCustomers']>[0]) {
    this.listOrganizationId = input.organizationId;
    return Promise.resolve({
      items: [],
      page: input.page,
      pageSize: input.pageSize,
      total: 0,
    });
  }
  findCustomer() {
    return Promise.resolve(customer);
  }
  createCustomer(input: Parameters<CustomerRepository['createCustomer']>[0]) {
    return Promise.resolve<CustomerWriteResult>({
      status: 'SUCCESS',
      customer: { ...customer, name: input.name, document: input.document },
    });
  }
  updateCustomer() {
    return Promise.resolve<CustomerWriteResult>({
      status: 'SUCCESS',
      customer,
    });
  }
  archiveCustomer() {
    return Promise.resolve<CustomerWriteResult>({
      status: 'SUCCESS',
      customer: { ...customer, archivedAt: now },
    });
  }
  listLocations() {
    return Promise.resolve({ items: [], page: 1, pageSize: 20, total: 0 });
  }
  findLocation() {
    return Promise.resolve(null);
  }
  createLocation() {
    return Promise.resolve<LocationWriteResult>({
      status: 'CUSTOMER_NOT_FOUND',
    });
  }
  updateLocation() {
    return Promise.resolve<LocationWriteResult>({ status: 'NOT_FOUND' });
  }
}

const customerId = '40000000-0000-4000-8000-000000000001';
const now = new Date('2026-08-16T00:00:00.000Z');
const customer = {
  id: customerId,
  name: 'Cliente HTTP',
  document: null,
  email: null,
  phone: null,
  notes: null,
  archivedAt: null,
  createdAt: now,
  updatedAt: now,
};
const session: ResolvedSession = {
  sessionId: '30000000-0000-4000-8000-000000000001',
  userId: '30000000-0000-4000-8000-000000000101',
  organizationId: '30000000-0000-4000-8000-000000000010',
};
const activeOwner: AuthenticatedUser = {
  id: session.userId,
  organizationId: session.organizationId,
  role: 'OWNER',
  status: 'ACTIVE',
  organizationStatus: 'ACTIVE',
};

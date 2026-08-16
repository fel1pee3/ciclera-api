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
import {
  TECHNICIAN_WORK_ORDER_REPOSITORY,
  type TechnicianWorkOrderRepository,
} from '../src/work-orders/application/ports/technician-work-order.repository';

describe('Technician work orders HTTP contract (e2e)', () => {
  let app: NestExpressApplication;
  let identities: TestIdentityRepository;
  let repository: TestTechnicianRepository;

  beforeAll(async () => {
    identities = new TestIdentityRepository();
    repository = new TestTechnicianRepository();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SESSION_RESOLVER)
      .useValue(new TestSessionResolver())
      .overrideProvider(AUTHENTICATED_USER_REPOSITORY)
      .useValue(identities)
      .overrideProvider(TECHNICIAN_WORK_ORDER_REPOSITORY)
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
    identities.user = technician;
    repository.requestedTechnicianId = null;
  });

  afterAll(async () => app?.close());

  it('derives technician identity and omits financial fields', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/field/work-orders?view=TODAY&page=1&pageSize=20')
      .expect(200);
    const body = response.body as unknown as {
      items: Array<Record<string, unknown>>;
    };
    expect(repository.requestedTechnicianId).toBe(session.userId);
    expect(body.items[0]).toMatchObject({
      id: workOrder.id,
      number: 'OS-000007',
      customer: { name: 'Cliente' },
    });
    expect(body.items[0]).not.toHaveProperty('expectedAmountInCents');
    expect(body.items[0]).not.toHaveProperty('finalAmountInCents');
  });

  it('returns not found for an unauthorized real id and blocks office roles', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/field/work-orders/60000000-0000-4000-8000-000000000099')
      .expect(404);
    identities.user = { ...technician, role: 'ADMIN' };
    await request(app.getHttpServer())
      .get('/api/v1/field/work-orders')
      .expect(403);
  });
});

class TestSessionResolver implements SessionResolver {
  resolveSession(): Promise<ResolvedSession> {
    return Promise.resolve(session);
  }
}
class TestIdentityRepository implements AuthenticatedUserRepository {
  user: AuthenticatedUser | null = technician;
  findById(): Promise<AuthenticatedUser | null> {
    return Promise.resolve(this.user);
  }
}
class TestTechnicianRepository implements TechnicianWorkOrderRepository {
  requestedTechnicianId: string | null = null;
  list(input: Parameters<TechnicianWorkOrderRepository['list']>[0]) {
    this.requestedTechnicianId = input.technicianId;
    return Promise.resolve({
      items: [workOrder],
      page: input.page,
      pageSize: input.pageSize,
      total: 1,
      timezone: 'America/Sao_Paulo',
    });
  }
  find(_organizationId: string, _technicianId: string, workOrderId: string) {
    return Promise.resolve(workOrderId === workOrder.id ? workOrder : null);
  }
}

const now = new Date('2026-08-16T12:00:00.000Z');
const workOrder = {
  id: '60000000-0000-4000-8000-000000000001',
  number: 7n,
  customer: { id: '60000000-0000-4000-8000-000000000002', name: 'Cliente' },
  location: {
    id: '60000000-0000-4000-8000-000000000003',
    name: 'Unidade',
    street: 'Rua Campo',
    number: '10',
    complement: null,
    neighborhood: 'Centro',
    city: 'São Paulo',
    state: 'SP',
  },
  equipment: null,
  serviceType: 'Manutenção',
  title: 'Atendimento',
  description: 'Executar atendimento.',
  priority: 'NORMAL' as const,
  status: 'SCHEDULED' as const,
  scheduledStartAt: now,
  scheduledEndAt: new Date('2026-08-16T13:00:00.000Z'),
  actualStartAt: null,
  actualEndAt: null,
  version: 2,
};
const session: ResolvedSession = {
  sessionId: '30000000-0000-4000-8000-000000000001',
  userId: '30000000-0000-4000-8000-000000000101',
  organizationId: '30000000-0000-4000-8000-000000000010',
};
const technician: AuthenticatedUser = {
  id: session.userId,
  organizationId: session.organizationId,
  role: 'TECHNICIAN',
  status: 'ACTIVE',
  organizationStatus: 'ACTIVE',
};

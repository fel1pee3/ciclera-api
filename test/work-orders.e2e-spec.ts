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
import { WORK_ORDER_REPOSITORY } from '../src/work-orders/application/ports/work-order.repository';
import type {
  WorkOrderRepository,
  WorkOrderTransitionResult,
  WorkOrderUpdateResult,
} from '../src/work-orders/application/ports/work-order.repository';
import type {
  WorkOrder,
  WorkOrderDetails,
} from '../src/work-orders/domain/work-order';

describe('Work orders HTTP contract (e2e)', () => {
  let app: NestExpressApplication;
  let identities: TestIdentityRepository;
  let repository: TestWorkOrderRepository;

  beforeAll(async () => {
    identities = new TestIdentityRepository();
    repository = new TestWorkOrderRepository();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SESSION_RESOLVER)
      .useValue(new TestSessionResolver())
      .overrideProvider(AUTHENTICATED_USER_REPOSITORY)
      .useValue(identities)
      .overrideProvider(WORK_ORDER_REPOSITORY)
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
    repository.record = baseRecord();
    repository.organizationId = null;
  });

  afterAll(async () => app?.close());

  it('creates a draft with decimal-string money and initial history', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/work-orders')
      .send(input)
      .expect(201);
    expect(response.body).toMatchObject({
      id: workOrderId,
      number: 'OS-000042',
      status: 'DRAFT',
      expectedAmountInCents: '15000',
      version: 1,
      history: [{ previousStatus: null, newStatus: 'DRAFT' }],
    });
    expect(response.body).not.toHaveProperty('organizationId');
  });

  it('paginates with the authenticated tenant and allowed ordering', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/work-orders?page=2&pageSize=5&status=DRAFT&orderBy=NUMBER_DESC',
      )
      .expect(200);
    expect(response.body as unknown).toMatchObject({
      page: 2,
      pageSize: 5,
      items: [{ number: 'OS-000042' }],
    });
    expect(repository.organizationId).toBe(activeOwner.organizationId);
  });

  it('rejects direct status and tenant mutation through PATCH', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/work-orders/${workOrderId}`)
      .send({ version: 1, status: 'BILLED' })
      .expect(422);
    await request(app.getHttpServer())
      .post('/api/v1/work-orders')
      .send({ ...input, organizationId: 'untrusted' })
      .expect(422);
  });

  it('cancels only through the semantic endpoint with a reason', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/work-orders/${workOrderId}/cancel`)
      .send({ version: 1, reason: 'Cliente desistiu do atendimento' })
      .expect(200);
    expect(response.body).toMatchObject({
      status: 'CANCELED',
      version: 2,
      cancellationReason: 'Cliente desistiu do atendimento',
    });
  });

  it('rejects technician administration access', async () => {
    identities.user = { ...activeOwner, role: 'TECHNICIAN' };
    await request(app.getHttpServer()).get('/api/v1/work-orders').expect(403);
  });

  it('exposes semantic scheduling and agenda contracts', async () => {
    const scheduled = await request(app.getHttpServer())
      .post(`/api/v1/work-orders/${workOrderId}/schedule`)
      .send({
        version: 1,
        technicianId,
        scheduledStartAt: '2026-08-17T12:00:00.000Z',
        scheduledEndAt: '2026-08-17T14:00:00.000Z',
      })
      .expect(200);
    expect(scheduled.body).toMatchObject({
      status: 'SCHEDULED',
      version: 2,
      assignments: [{ technicianId, unassignedAt: null }],
    });

    const agenda = await request(app.getHttpServer())
      .get('/api/v1/work-orders/agenda?from=2026-08-17&to=2026-08-17')
      .expect(200);
    expect(agenda.body).toMatchObject({
      timezone: 'America/Sao_Paulo',
      from: '2026-08-17',
      to: '2026-08-17',
    });
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

class TestWorkOrderRepository implements WorkOrderRepository {
  record = baseRecord();
  organizationId: string | null = null;

  list(inputValue: Parameters<WorkOrderRepository['list']>[0]) {
    this.organizationId = inputValue.organizationId;
    return Promise.resolve({
      items: [this.record],
      page: inputValue.page,
      pageSize: inputValue.pageSize,
      total: 1,
    });
  }

  find(): Promise<WorkOrderDetails> {
    return Promise.resolve({
      ...this.record,
      history: history(this.record),
      assignments: this.record.status === 'SCHEDULED' ? [assignment] : [],
    });
  }

  createDraft(): Promise<WorkOrder> {
    return Promise.resolve(this.record);
  }

  updateDraft(): Promise<WorkOrderUpdateResult> {
    this.record = { ...this.record, version: this.record.version + 1 };
    return Promise.resolve({ status: 'SUCCESS', workOrder: this.record });
  }

  transition(
    inputValue: Parameters<WorkOrderRepository['transition']>[0],
  ): Promise<WorkOrderTransitionResult> {
    this.record = {
      ...this.record,
      status: 'CANCELED',
      version: 2,
      canceledByUserId: inputValue.actorUserId,
      canceledAt: now,
      cancellationReason: inputValue.reason ?? null,
    };
    return Promise.resolve({ status: 'SUCCESS', workOrder: this.record });
  }

  schedule(): ReturnType<WorkOrderRepository['schedule']> {
    this.record = {
      ...this.record,
      status: 'SCHEDULED',
      version: 2,
      scheduledStartAt: new Date('2026-08-17T12:00:00.000Z'),
      scheduledEndAt: new Date('2026-08-17T14:00:00.000Z'),
    };
    return Promise.resolve({ status: 'SUCCESS' });
  }

  reschedule(): ReturnType<WorkOrderRepository['reschedule']> {
    return Promise.resolve({ status: 'SUCCESS' });
  }

  reassign(): ReturnType<WorkOrderRepository['reassign']> {
    return Promise.resolve({ status: 'SUCCESS' });
  }

  agenda(
    inputValue: Parameters<WorkOrderRepository['agenda']>[0],
  ): ReturnType<WorkOrderRepository['agenda']> {
    return Promise.resolve({
      items:
        this.record.status === 'SCHEDULED'
          ? [{ ...this.record, activeAssignment: assignment }]
          : [],
      timezone: 'America/Sao_Paulo',
      from: inputValue.from,
      to: inputValue.to,
    });
  }
}

function baseRecord(): WorkOrder {
  return {
    id: workOrderId,
    number: 42n,
    customerId,
    locationId,
    equipmentId: null,
    serviceType: input.serviceType,
    title: input.title,
    description: input.description,
    priority: 'NORMAL',
    status: 'DRAFT',
    scheduledStartAt: null,
    scheduledEndAt: null,
    actualStartAt: null,
    actualEndAt: null,
    expectedAmountInCents: 15_000n,
    finalAmountInCents: null,
    version: 1,
    createdByUserId: session.userId,
    canceledByUserId: null,
    canceledAt: null,
    cancellationReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

function history(record: WorkOrder) {
  return [
    {
      id: '60000000-0000-4000-8000-000000000004',
      previousStatus: null,
      newStatus: 'DRAFT' as const,
      actorUserId: session.userId,
      reason: 'WORK_ORDER_CREATED',
      createdAt: now,
    },
    ...(record.status === 'CANCELED'
      ? [
          {
            id: '60000000-0000-4000-8000-000000000005',
            previousStatus: 'DRAFT' as const,
            newStatus: 'CANCELED' as const,
            actorUserId: session.userId,
            reason: record.cancellationReason,
            createdAt: now,
          },
        ]
      : []),
  ];
}

const now = new Date('2026-08-16T00:00:00.000Z');
const workOrderId = '60000000-0000-4000-8000-000000000001';
const customerId = '60000000-0000-4000-8000-000000000002';
const locationId = '60000000-0000-4000-8000-000000000003';
const input = {
  customerId,
  locationId,
  serviceType: 'Manutenção preventiva',
  title: 'Revisar equipamento',
  description: 'Executar revisão técnica.',
  expectedAmountInCents: '15000',
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
const technicianId = '30000000-0000-4000-8000-000000000102';
const assignment = {
  id: '30000000-0000-4000-8000-000000000103',
  technicianId,
  technicianName: 'Técnico',
  assignedByUserId: session.userId,
  assignedAt: now,
  unassignedByUserId: null,
  unassignedAt: null,
};

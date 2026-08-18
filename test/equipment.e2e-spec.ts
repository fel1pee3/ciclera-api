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
import { EQUIPMENT_REPOSITORY } from '../src/equipment/application/ports/equipment.repository';
import type {
  EquipmentRepository,
  EquipmentWriteResult,
} from '../src/equipment/application/ports/equipment.repository';

describe('Equipment HTTP contract (e2e)', () => {
  let app: NestExpressApplication;
  let identities: TestIdentityRepository;
  let repository: TestEquipmentRepository;

  beforeAll(async () => {
    identities = new TestIdentityRepository();
    repository = new TestEquipmentRepository();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SESSION_RESOLVER)
      .useValue(new TestSessionResolver())
      .overrideProvider(AUTHENTICATED_USER_REPOSITORY)
      .useValue(identities)
      .overrideProvider(EQUIPMENT_REPOSITORY)
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
    repository.organizationId = null;
  });

  afterAll(async () => app?.close());

  it('uses only the tenant from the authenticated principal', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/equipment?page=2&pageSize=5&archive=ALL')
      .expect(200)
      .expect({ items: [], page: 2, pageSize: 5, total: 0 });
    expect(repository.organizationId).toBe(activeOwner.organizationId);

    await request(app.getHttpServer())
      .post('/api/v1/equipment')
      .send({ ...input, organizationId: 'untrusted' })
      .expect(422);
  });

  it('exposes create, archive, and reactivate without leaking internal fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/equipment')
      .send(input)
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({ id: equipmentId, name: input.name });
        expect(body).not.toHaveProperty('organizationId');
        expect(body).not.toHaveProperty('normalizedSerialNumber');
      });
    await request(app.getHttpServer())
      .post(`/api/v1/equipment/${equipmentId}/archive`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/equipment/${equipmentId}/reactivate`)
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ archivedAt: null }));
    await request(app.getHttpServer())
      .delete(`/api/v1/equipment/${equipmentId}`)
      .expect(404);
  });

  it('rejects technician access', async () => {
    identities.user = { ...activeOwner, role: 'TECHNICIAN' };
    await request(app.getHttpServer()).get('/api/v1/equipment').expect(403);
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

class TestEquipmentRepository implements EquipmentRepository {
  organizationId: string | null = null;
  list(inputValue: Parameters<EquipmentRepository['list']>[0]) {
    this.organizationId = inputValue.organizationId;
    return Promise.resolve({
      items: [],
      page: inputValue.page,
      pageSize: inputValue.pageSize,
      total: 0,
    });
  }
  find() {
    return Promise.resolve(equipmentRecord);
  }
  create(inputValue: Parameters<EquipmentRepository['create']>[0]) {
    return Promise.resolve<EquipmentWriteResult>({
      status: 'SUCCESS',
      equipment: { ...equipmentRecord, name: inputValue.name },
    });
  }
  update() {
    return Promise.resolve<EquipmentWriteResult>({
      status: 'SUCCESS',
      equipment: equipmentRecord,
    });
  }
  archive() {
    return Promise.resolve<EquipmentWriteResult>({
      status: 'SUCCESS',
      equipment: { ...equipmentRecord, archivedAt: now },
    });
  }
  reactivate() {
    return Promise.resolve<EquipmentWriteResult>({
      status: 'SUCCESS',
      equipment: equipmentRecord,
    });
  }
}

const equipmentId = '50000000-0000-4000-8000-000000000001';
const customerId = '50000000-0000-4000-8000-000000000002';
const locationId = '50000000-0000-4000-8000-000000000003';
const now = new Date('2026-08-16T00:00:00.000Z');
const input = {
  customerId,
  locationId,
  name: 'Bomba principal',
  identifier: 'BMB-01',
  category: 'Bomba',
  serialNumber: 'SERIAL-01',
};
const equipmentRecord = {
  id: equipmentId,
  customerId,
  locationId,
  name: input.name,
  identifier: input.identifier,
  category: input.category,
  brand: null,
  model: null,
  serialNumber: input.serialNumber,
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

import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import type { AuthenticatedPrincipal } from '../../src/auth/domain/authenticated-principal';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';
import {
  WORK_ORDER_REPOSITORY,
  type WorkOrderRepository,
} from '../../src/work-orders/application/ports/work-order.repository';
import { WorkOrdersService } from '../../src/work-orders/application/work-orders.service';
import {
  WorkOrderNotFoundError,
  WorkOrderRelationInvalidError,
  WorkOrderStatusLockedError,
} from '../../src/work-orders/domain/work-order.errors';

describe('Work order draft management', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: WorkOrdersService;
  let repository: WorkOrderRepository;
  const organizationIds: string[] = [];
  let ownerA: AuthenticatedPrincipal;
  let ownerB: AuthenticatedPrincipal;
  let relationA: RelationFixture;
  let relationB: RelationFixture;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(WorkOrdersService);
    repository = moduleRef.get(WORK_ORDER_REPOSITORY);
    await assertTestDatabase(prisma);
    const suffix = `${Date.now()}-${process.pid}`;
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({ data: { name: `Orders A ${suffix}` } }),
      prisma.organization.create({ data: { name: `Orders B ${suffix}` } }),
    ]);
    organizationIds.push(organizationA.id, organizationB.id);
    const [userA, userB] = await Promise.all([
      fixtureOwner(prisma, organizationA.id, `orders-a-${suffix}`),
      fixtureOwner(prisma, organizationB.id, `orders-b-${suffix}`),
    ]);
    ownerA = principal(userA.id, organizationA.id);
    ownerB = principal(userB.id, organizationB.id);
    [relationA, relationB] = await Promise.all([
      fixtureRelation(prisma, organizationA.id, 'A'),
      fixtureRelation(prisma, organizationB.id, 'B'),
    ]);
  });

  afterAll(async () => {
    if (organizationIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.workOrderStatusHistory.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.workOrder.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.workOrderCounter.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.equipment.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.serviceLocation.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.customer.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.user.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }
    await moduleRef?.close();
  });

  it('creates a DRAFT with a readable source number and initial history', async () => {
    const created = await service.create(context(ownerA, 'create-draft'), {
      ...input(relationA),
      expectedAmountInCents: '9007199254740993',
    });
    expect(created).toMatchObject({
      status: 'DRAFT',
      version: 1,
      expectedAmountInCents: 9_007_199_254_740_993n,
    });
    expect(created.number).toBeGreaterThan(0n);
    expect(created.history).toMatchObject([
      { previousStatus: null, newStatus: 'DRAFT', actorUserId: ownerA.userId },
    ]);
  });

  it('rejects every cross-tenant relation and hides another tenant order', async () => {
    await expect(
      service.create(context(ownerA, 'cross-tenant-create'), input(relationB)),
    ).rejects.toBeInstanceOf(WorkOrderRelationInvalidError);
    const orderA = await service.create(
      context(ownerA, 'tenant-hidden-create'),
      input(relationA),
    );
    await expect(
      service.find(context(ownerB, 'cross-tenant-read'), orderA.id),
    ).rejects.toBeInstanceOf(WorkOrderNotFoundError);
  });

  it('updates only draft fields with optimistic versioning and server paging', async () => {
    const created = await service.create(
      context(ownerA, 'update-create'),
      input(relationA),
    );
    const updated = await service.update(
      context(ownerA, 'update-draft'),
      created.id,
      created.version,
      { title: 'Título revisado', expectedAmountInCents: '25000' },
    );
    expect(updated).toMatchObject({
      title: 'Título revisado',
      expectedAmountInCents: 25_000n,
      version: 2,
      status: 'DRAFT',
    });
    const page = await service.list(context(ownerA, 'list-draft'), {
      page: 1,
      pageSize: 1,
      search: 'titulo revisado',
      status: 'DRAFT',
      orderBy: 'NUMBER_DESC',
    });
    expect(page).toMatchObject({ page: 1, pageSize: 1 });
    expect(page.items[0]?.id).toBe(created.id);
  });

  it('blocks generic edits after the draft status changes', async () => {
    const created = await service.create(
      context(ownerA, 'locked-create'),
      input(relationA),
    );
    await repository.transition({
      organizationId: ownerA.organizationId,
      actorUserId: ownerA.userId,
      requestId: 'test-only-schedule',
      workOrderId: created.id,
      expectedVersion: 1,
      action: 'SCHEDULE',
    });
    await expect(
      service.update(context(ownerA, 'locked-update'), created.id, 2, {
        title: 'Mudança indevida',
      }),
    ).rejects.toBeInstanceOf(WorkOrderStatusLockedError);
  });

  it('cancels a draft with a reason and appends real history', async () => {
    const created = await service.create(
      context(ownerA, 'cancel-create'),
      input(relationA),
    );
    const canceled = await service.cancelDraft(
      context(ownerA, 'cancel-draft'),
      created.id,
      created.version,
      'Solicitação registrada pelo cliente',
    );
    expect(canceled).toMatchObject({
      status: 'CANCELED',
      version: 2,
      canceledByUserId: ownerA.userId,
      cancellationReason: 'Solicitação registrada pelo cliente',
    });
    expect(canceled.history.map((entry) => entry.newStatus)).toEqual([
      'DRAFT',
      'CANCELED',
    ]);
  });
});

interface RelationFixture {
  customerId: string;
  locationId: string;
  equipmentId: string;
}

function input(relation: RelationFixture) {
  return {
    ...relation,
    serviceType: 'Manutenção preventiva',
    title: 'Revisar equipamento',
    description: 'Executar a revisão técnica do ativo.',
    priority: 'HIGH' as const,
  };
}

function context(principalValue: AuthenticatedPrincipal, requestId: string) {
  return { principal: principalValue, requestId };
}

function principal(
  userId: string,
  organizationId: string,
): AuthenticatedPrincipal {
  return { userId, organizationId, role: 'OWNER', sessionId: randomUUID() };
}

async function fixtureRelation(
  prisma: PrismaService,
  organizationId: string,
  label: string,
): Promise<RelationFixture> {
  const customer = await prisma.customer.create({
    data: {
      organizationId,
      name: `Cliente ${label}`,
      normalizedName: `cliente ${label.toLowerCase()}`,
    },
  });
  const location = await prisma.serviceLocation.create({
    data: {
      organizationId,
      customerId: customer.id,
      name: `Local ${label}`,
      normalizedName: `local ${label.toLowerCase()}`,
      postalCode: '01000-000',
      street: 'Rua Teste',
      number: '10',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    },
  });
  const equipment = await prisma.equipment.create({
    data: {
      organizationId,
      customerId: customer.id,
      locationId: location.id,
      name: `Equipamento ${label}`,
      normalizedName: `equipamento ${label.toLowerCase()}`,
      identifier: `EQ-${label}`,
      normalizedIdentifier: `eq-${label.toLowerCase()}`,
      category: 'Teste',
    },
  });
  return {
    customerId: customer.id,
    locationId: location.id,
    equipmentId: equipment.id,
  };
}

function fixtureOwner(
  prisma: PrismaService,
  organizationId: string,
  identity: string,
) {
  const email = `${identity}@example.test`;
  return prisma.user.create({
    data: {
      organizationId,
      name: identity,
      email,
      normalizedEmail: email,
      passwordHash: `integration-only-${identity}`,
      role: 'OWNER',
    },
  });
}

async function assertTestDatabase(prisma: PrismaService): Promise<void> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required.');
  const expected = decodeURIComponent(
    new URL(testDatabaseUrl).pathname.slice(1),
  );
  const [connection] = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (connection?.database !== expected) {
    throw new Error('Work orders test connected to an unexpected database.');
  }
}

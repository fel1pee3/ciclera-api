import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';
import {
  WORK_ORDER_REPOSITORY,
  type WorkOrderRepository,
} from '../../src/work-orders/application/ports/work-order.repository';
import { InvalidWorkOrderTransitionError } from '../../src/work-orders/domain/work-order-state-machine';

describe('Work order persistence foundation', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let repository: WorkOrderRepository;
  const organizationIds: string[] = [];
  let organizationId: string;
  let actorUserId: string;
  let customerId: string;
  let locationId: string;
  let equipmentId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    repository = moduleRef.get(WORK_ORDER_REPOSITORY);
    await assertTestDatabase(prisma);
    const organization = await prisma.organization.create({
      data: { name: `Work order ${Date.now()}-${process.pid}` },
    });
    organizationId = organization.id;
    organizationIds.push(organizationId);
    const actor = await prisma.user.create({
      data: {
        organizationId,
        name: 'Work order owner',
        email: `work-order-${organizationId}@example.test`,
        normalizedEmail: `work-order-${organizationId}@example.test`,
        passwordHash: 'integration-only-work-order',
        role: 'OWNER',
      },
    });
    actorUserId = actor.id;
    const customer = await prisma.customer.create({
      data: {
        organizationId,
        name: 'Cliente de OS',
        normalizedName: 'cliente de os',
      },
    });
    customerId = customer.id;
    const location = await prisma.serviceLocation.create({
      data: {
        organizationId,
        customerId,
        name: 'Unidade de OS',
        normalizedName: 'unidade de os',
        postalCode: '01000-000',
        street: 'Rua Teste',
        number: '10',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
      },
    });
    locationId = location.id;
    const equipment = await prisma.equipment.create({
      data: {
        organizationId,
        customerId,
        locationId,
        name: 'Equipamento de OS',
        normalizedName: 'equipamento de os',
        identifier: 'EQ-OS',
        normalizedIdentifier: 'eq-os',
        category: 'Teste',
      },
    });
    equipmentId = equipment.id;
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

  it('allocates unique per-organization numbers under concurrency', async () => {
    const created = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        repository.createDraft({
          ...context(`concurrent-${index}`),
          ...draftData,
          customerId,
          locationId,
          equipmentId,
          title: `Ordem concorrente ${index}`,
          normalizedTitle: `ordem concorrente ${index}`,
        }),
      ),
    );
    const numbers = created.map((workOrder) => workOrder.number);
    expect(new Set(numbers).size).toBe(created.length);
    expect(numbers.every((number) => number > 0n)).toBe(true);
  });

  it('stores money as bigint and creates the initial history atomically', async () => {
    const workOrder = await repository.createDraft({
      ...context('initial-history'),
      ...draftData,
      customerId,
      locationId,
      equipmentId,
      expectedAmountInCents: 9_007_199_254_740_993n,
    });
    expect(workOrder.expectedAmountInCents).toBe(9_007_199_254_740_993n);
    await expect(
      prisma.workOrderStatusHistory.findMany({
        where: { organizationId, workOrderId: workOrder.id },
      }),
    ).resolves.toMatchObject([
      { previousStatus: null, newStatus: 'DRAFT', actorUserId },
    ]);
  });

  it('rolls back the status when history cannot be persisted', async () => {
    const workOrder = await repository.createDraft({
      ...context('rollback-create'),
      ...draftData,
      customerId,
      locationId,
      equipmentId: null,
    });
    await expect(
      repository.transition({
        ...context('rollback-transition'),
        actorUserId: randomUUID(),
        workOrderId: workOrder.id,
        expectedVersion: 1,
        action: 'CANCEL',
        reason: 'Teste de atomicidade',
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } }),
    ).resolves.toMatchObject({ status: 'DRAFT', version: 1 });
    await expect(
      prisma.workOrderStatusHistory.count({
        where: { organizationId, workOrderId: workOrder.id },
      }),
    ).resolves.toBe(1);
  });

  it('uses optimistic versioning and rejects invalid transitions', async () => {
    const workOrder = await repository.createDraft({
      ...context('transition-create'),
      ...draftData,
      customerId,
      locationId,
      equipmentId: null,
    });
    await expect(
      repository.transition({
        ...context('stale-transition'),
        workOrderId: workOrder.id,
        expectedVersion: 99,
        action: 'CANCEL',
      }),
    ).resolves.toEqual({ status: 'VERSION_CONFLICT' });
    const transitioned = await repository.transition({
      ...context('valid-transition'),
      workOrderId: workOrder.id,
      expectedVersion: 1,
      action: 'CANCEL',
      reason: 'Rascunho cancelado no teste',
    });
    expect(transitioned).toMatchObject({
      status: 'SUCCESS',
      workOrder: { status: 'CANCELED', version: 2 },
    });
    await expect(
      repository.transition({
        ...context('invalid-transition'),
        workOrderId: workOrder.id,
        expectedVersion: 2,
        action: 'SCHEDULE',
      }),
    ).rejects.toBeInstanceOf(InvalidWorkOrderTransitionError);
    await expect(
      prisma.workOrderStatusHistory.count({
        where: { organizationId, workOrderId: workOrder.id },
      }),
    ).resolves.toBe(2);
  });

  function context(requestId: string) {
    return { organizationId, actorUserId, requestId };
  }
});

const draftData = {
  serviceType: 'Manutenção preventiva',
  title: 'Revisar equipamento',
  normalizedTitle: 'revisar equipamento',
  description: 'Executar revisão técnica.',
  priority: 'NORMAL' as const,
  scheduledStartAt: null,
  scheduledEndAt: null,
  expectedAmountInCents: 15_000n,
};

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
    throw new Error('Work order test connected to an unexpected database.');
  }
}

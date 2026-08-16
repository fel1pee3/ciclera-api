import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import type { AuthenticatedPrincipal } from '../../src/auth/domain/authenticated-principal';
import { HistoryService } from '../../src/history/application/history.service';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';
import { WorkOrderNotFoundError } from '../../src/work-orders/domain/work-order.errors';

describe('Operational history', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let history: HistoryService;
  const organizationIds: string[] = [];
  let ownerA: AuthenticatedPrincipal;
  let ownerB: AuthenticatedPrincipal;
  let orderId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    history = moduleRef.get(HistoryService);
    await assertTestDatabase(prisma);
    const suffix = `${Date.now()}-${process.pid}`;
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({ data: { name: `History A ${suffix}` } }),
      prisma.organization.create({ data: { name: `History B ${suffix}` } }),
    ]);
    organizationIds.push(organizationA.id, organizationB.id);
    const [owner, technician, foreignOwner] = await Promise.all([
      createUser(prisma, organizationA.id, `history-owner-${suffix}`, 'OWNER'),
      createUser(
        prisma,
        organizationA.id,
        `history-tech-${suffix}`,
        'TECHNICIAN',
      ),
      createUser(
        prisma,
        organizationB.id,
        `history-foreign-${suffix}`,
        'OWNER',
      ),
    ]);
    ownerA = principal(owner.id, organizationA.id);
    ownerB = principal(foreignOwner.id, organizationB.id);
    const relation = await createRelation(prisma, organizationA.id);
    const order = await prisma.workOrder.create({
      data: {
        organizationId: organizationA.id,
        number: 1n,
        ...relation,
        serviceType: 'Teste',
        title: 'Histórico real',
        normalizedTitle: 'historico real',
        description: 'Ordem de teste.',
        status: 'BILLED',
        billedAt: new Date(),
        billedByUserId: owner.id,
        createdByUserId: owner.id,
      },
    });
    orderId = order.id;
    await prisma.workOrderStatusHistory.create({
      data: {
        organizationId: organizationA.id,
        workOrderId: order.id,
        previousStatus: null,
        newStatus: 'DRAFT',
        actorUserId: owner.id,
        reason: 'WORK_ORDER_CREATED',
      },
    });
    await prisma.workOrderAssignment.create({
      data: {
        organizationId: organizationA.id,
        workOrderId: order.id,
        technicianId: technician.id,
        assignedByUserId: owner.id,
      },
    });
    await prisma.review.create({
      data: {
        organizationId: organizationA.id,
        workOrderId: order.id,
        actorUserId: owner.id,
        decision: 'APPROVED',
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: organizationA.id,
        actorUserId: owner.id,
        action: 'WORK_ORDER_BILLED',
        resourceType: 'WORK_ORDER',
        resourceId: order.id,
        requestId: 'history-request',
        metadata: {
          finalAmountInCents: '2500',
          authorization: 'must-not-leak',
        },
      },
    });
  }, 20_000);

  afterAll(async () => {
    for (const organizationId of organizationIds) {
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.review.deleteMany({ where: { organizationId } });
      await prisma.workOrderAssignment.deleteMany({
        where: { organizationId },
      });
      await prisma.workOrderStatusHistory.deleteMany({
        where: { organizationId },
      });
      await prisma.workOrder.deleteMany({ where: { organizationId } });
      await prisma.serviceLocation.deleteMany({ where: { organizationId } });
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.user.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await moduleRef?.close();
  }, 20_000);

  it('returns ordered real events, actors and allowlisted audit metadata', async () => {
    const result = await history.find(ownerA, orderId);
    expect(result.timeline.map((entry) => entry.type).sort()).toEqual([
      'ASSIGNMENT',
      'BILLING',
      'REVIEW',
      'STATUS',
    ]);
    expect(
      result.timeline.every(
        (entry, index) =>
          index === 0 ||
          new Date(entry.occurredAt).getTime() >=
            new Date(result.timeline[index - 1].occurredAt).getTime(),
      ),
    ).toBe(true);
    expect(result.timeline.every((entry) => entry.actor.name.length > 0)).toBe(
      true,
    );
    expect(result.audit[0]).toMatchObject({
      requestId: 'history-request',
      metadata: { finalAmountInCents: '2500' },
    });
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
  });

  it('does not disclose a foreign tenant history', async () => {
    await expect(history.find(ownerB, orderId)).rejects.toBeInstanceOf(
      WorkOrderNotFoundError,
    );
  });
});

function principal(
  userId: string,
  organizationId: string,
): AuthenticatedPrincipal {
  return { userId, organizationId, role: 'OWNER', sessionId: randomUUID() };
}

function createUser(
  prisma: PrismaService,
  organizationId: string,
  identity: string,
  role: 'OWNER' | 'TECHNICIAN',
) {
  const email = `${identity}@example.test`;
  return prisma.user.create({
    data: {
      organizationId,
      name: identity,
      email,
      normalizedEmail: email,
      passwordHash: identity,
      role,
    },
  });
}

async function createRelation(prisma: PrismaService, organizationId: string) {
  const customer = await prisma.customer.create({
    data: { organizationId, name: 'Cliente', normalizedName: 'cliente' },
  });
  const location = await prisma.serviceLocation.create({
    data: {
      organizationId,
      customerId: customer.id,
      name: 'Local',
      normalizedName: 'local',
      postalCode: '01000-000',
      street: 'Rua Teste',
      number: '1',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    },
  });
  return { customerId: customer.id, locationId: location.id };
}

async function assertTestDatabase(prisma: PrismaService) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required.');
  const expected = decodeURIComponent(new URL(url).pathname.slice(1));
  const [connection] = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (connection?.database !== expected)
    throw new Error('Unexpected database.');
}

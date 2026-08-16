import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import type { AuthenticatedPrincipal } from '../../src/auth/domain/authenticated-principal';
import { BillingService } from '../../src/billing/application/billing.service';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';
import {
  WorkOrderManagementForbiddenError,
  WorkOrderNotFoundError,
} from '../../src/work-orders/domain/work-order.errors';

describe('Billing ready queue', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let billing: BillingService;
  let organizationId: string;
  let foreignOrganizationId: string;
  let owner: AuthenticatedPrincipal;
  let technician: AuthenticatedPrincipal;
  let customerId: string;
  let readyId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    billing = moduleRef.get(BillingService);
    await assertTestDatabase(prisma);
    const suffix = `${Date.now()}-${process.pid}`;
    const [organization, foreignOrganization] = await Promise.all([
      prisma.organization.create({ data: { name: `Billing ${suffix}` } }),
      prisma.organization.create({
        data: { name: `Billing foreign ${suffix}` },
      }),
    ]);
    organizationId = organization.id;
    foreignOrganizationId = foreignOrganization.id;
    const [ownerUser, technicianUser, foreignUser] = await Promise.all([
      createUser(prisma, organizationId, `billing-owner-${suffix}`, 'OWNER'),
      createUser(
        prisma,
        organizationId,
        `billing-tech-${suffix}`,
        'TECHNICIAN',
      ),
      createUser(
        prisma,
        foreignOrganizationId,
        `billing-foreign-${suffix}`,
        'OWNER',
      ),
    ]);
    owner = principal(ownerUser.id, organizationId, 'OWNER');
    technician = principal(technicianUser.id, organizationId, 'TECHNICIAN');
    const relation = await createRelation(prisma, organizationId);
    customerId = relation.customerId;
    const foreignRelation = await createRelation(prisma, foreignOrganizationId);
    const approvedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const ready = await createReadyOrder(prisma, {
      organizationId,
      creatorId: ownerUser.id,
      actorId: ownerUser.id,
      relation,
      number: 1n,
      finalAmountInCents: 12_500n,
      completedAt: approvedAt,
    });
    readyId = ready.id;
    await createReadyOrder(prisma, {
      organizationId: foreignOrganizationId,
      creatorId: foreignUser.id,
      actorId: foreignUser.id,
      relation: foreignRelation,
      number: 1n,
      finalAmountInCents: 999_999n,
      completedAt: approvedAt,
    });
    await prisma.workOrder.create({
      data: {
        organizationId,
        number: 2n,
        ...relation,
        serviceType: 'Teste',
        title: 'Ainda não aprovada',
        normalizedTitle: 'ainda nao aprovada',
        description: 'Não deve aparecer.',
        status: 'AWAITING_REVIEW',
        createdByUserId: ownerUser.id,
        actualEndAt: approvedAt,
        finalAmountInCents: 50_000n,
      },
    });
  }, 20_000);

  afterAll(async () => {
    for (const id of [organizationId, foreignOrganizationId]) {
      if (!id) continue;
      await prisma.review.deleteMany({ where: { organizationId: id } });
      await prisma.auditLog.deleteMany({ where: { organizationId: id } });
      await prisma.workOrderStatusHistory.deleteMany({
        where: { organizationId: id },
      });
      await prisma.workOrder.deleteMany({ where: { organizationId: id } });
      await prisma.workOrderCounter.deleteMany({
        where: { organizationId: id },
      });
      await prisma.serviceLocation.deleteMany({
        where: { organizationId: id },
      });
      await prisma.customer.deleteMany({ where: { organizationId: id } });
      await prisma.user.deleteMany({ where: { organizationId: id } });
      await prisma.organization.delete({ where: { id } });
    }
    await moduleRef?.close();
  }, 20_000);

  it('lists only tenant approved orders and totals the filtered result', async () => {
    const result = await billing.listReady(owner, {
      page: 1,
      pageSize: 20,
      customerId,
      minimumAgingDays: 1,
      minimumAmountInCents: 10_000n,
      maximumAmountInCents: 20_000n,
    });
    expect(result.items.map((item) => item.id)).toEqual([readyId]);
    expect(result.total).toBe(1);
    expect(result.totalAmountInCents).toBe(12_500n);
    await expect(
      billing.listReady(technician, { page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(WorkOrderManagementForbiddenError);
  });

  it('marks billed idempotently with attribution and no duplicate history', async () => {
    const current = await prisma.workOrder.findUniqueOrThrow({
      where: { id: readyId },
    });
    const first = await billing.markBilled(
      owner,
      'billing-first',
      readyId,
      current.version,
    );
    const repeated = await billing.markBilled(
      owner,
      'billing-repeat',
      readyId,
      current.version,
    );
    expect(repeated).toEqual(first);
    await expect(
      prisma.workOrder.findUniqueOrThrow({ where: { id: readyId } }),
    ).resolves.toMatchObject({
      status: 'BILLED',
      billedAt: first.billedAt,
      billedByUserId: owner.userId,
    });
    await expect(
      prisma.workOrderStatusHistory.count({
        where: {
          organizationId,
          workOrderId: readyId,
          newStatus: 'BILLED',
        },
      }),
    ).resolves.toBe(1);
    const queue = await billing.listReady(owner, { page: 1, pageSize: 20 });
    expect(queue.items).toHaveLength(0);
    expect(queue.totalAmountInCents).toBe(0n);
  });

  it('does not disclose a foreign tenant order', async () => {
    const foreign = await prisma.workOrder.findFirstOrThrow({
      where: { organizationId: foreignOrganizationId },
    });
    await expect(
      billing.markBilled(
        owner,
        'billing-cross-tenant',
        foreign.id,
        foreign.version,
      ),
    ).rejects.toBeInstanceOf(WorkOrderNotFoundError);
  });
});

function principal(
  userId: string,
  organizationId: string,
  role: 'OWNER' | 'TECHNICIAN',
): AuthenticatedPrincipal {
  return { userId, organizationId, role, sessionId: randomUUID() };
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
      passwordHash: `integration-${identity}`,
      role,
    },
  });
}

async function createRelation(prisma: PrismaService, organizationId: string) {
  const customer = await prisma.customer.create({
    data: {
      organizationId,
      name: 'Cliente faturamento',
      normalizedName: 'cliente faturamento',
    },
  });
  const location = await prisma.serviceLocation.create({
    data: {
      organizationId,
      customerId: customer.id,
      name: 'Local faturamento',
      normalizedName: 'local faturamento',
      postalCode: '01000-000',
      street: 'Rua Financeira',
      number: '10',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    },
  });
  return { customerId: customer.id, locationId: location.id };
}

async function createReadyOrder(
  prisma: PrismaService,
  input: {
    organizationId: string;
    creatorId: string;
    actorId: string;
    relation: { customerId: string; locationId: string };
    number: bigint;
    finalAmountInCents: bigint;
    completedAt: Date;
  },
) {
  const workOrder = await prisma.workOrder.create({
    data: {
      organizationId: input.organizationId,
      number: input.number,
      ...input.relation,
      serviceType: 'Teste',
      title: 'Pronta para faturar',
      normalizedTitle: 'pronta para faturar',
      description: 'Ordem aprovada.',
      status: 'READY_TO_BILL',
      createdByUserId: input.creatorId,
      actualEndAt: input.completedAt,
      finalAmountInCents: input.finalAmountInCents,
      financialSnapshot: {
        finalAmountInCents: input.finalAmountInCents.toString(),
      },
    },
  });
  await prisma.review.create({
    data: {
      organizationId: input.organizationId,
      workOrderId: workOrder.id,
      actorUserId: input.actorId,
      decision: 'APPROVED',
      createdAt: input.completedAt,
    },
  });
  return workOrder;
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
    throw new Error('Billing test connected to an unexpected database.');
  }
}

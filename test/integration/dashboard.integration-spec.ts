import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import type { AuthenticatedPrincipal } from '../../src/auth/domain/authenticated-principal';
import { DashboardService } from '../../src/dashboard/application/dashboard.service';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';
import { WorkOrderManagementForbiddenError } from '../../src/work-orders/domain/work-order.errors';

describe('Revenue assurance dashboard', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let dashboard: DashboardService;
  const organizationIds: string[] = [];
  let owner: AuthenticatedPrincipal;
  let technician: AuthenticatedPrincipal;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    dashboard = moduleRef.get(DashboardService);
    await assertTestDatabase(prisma);
    const suffix = `${Date.now()}-${process.pid}`;
    const [organization, foreign] = await Promise.all([
      prisma.organization.create({
        data: { name: `Dashboard ${suffix}`, timezone: 'America/Sao_Paulo' },
      }),
      prisma.organization.create({
        data: { name: `Dashboard foreign ${suffix}` },
      }),
    ]);
    organizationIds.push(organization.id, foreign.id);
    const [ownerUser, technicianUser, foreignUser] = await Promise.all([
      createUser(prisma, organization.id, `dash-owner-${suffix}`, 'OWNER'),
      createUser(prisma, organization.id, `dash-tech-${suffix}`, 'TECHNICIAN'),
      createUser(prisma, foreign.id, `dash-foreign-${suffix}`, 'OWNER'),
    ]);
    owner = principal(ownerUser.id, organization.id, 'OWNER');
    technician = principal(technicianUser.id, organization.id, 'TECHNICIAN');
    const relation = await createRelation(prisma, organization.id);
    const foreignRelation = await createRelation(prisma, foreign.id);
    const completedAt = new Date();
    const blocked = await prisma.workOrder.create({
      data: {
        organizationId: organization.id,
        number: 1n,
        ...relation,
        serviceType: 'Preventiva',
        title: 'Ordem bloqueada',
        normalizedTitle: 'ordem bloqueada',
        description: 'Teste do painel.',
        status: 'PENDING_CORRECTION',
        expectedAmountInCents: 10_000n,
        actualEndAt: completedAt,
        createdByUserId: ownerUser.id,
      },
    });
    const execution = await prisma.workOrderExecution.create({
      data: {
        organizationId: organization.id,
        workOrderId: blocked.id,
        technicianId: technicianUser.id,
      },
    });
    await prisma.additionalItem.create({
      data: {
        organizationId: organization.id,
        workOrderId: blocked.id,
        executionId: execution.id,
        type: 'MATERIAL',
        description: 'Peça',
        quantityInThousand: 1000n,
        unitAmountInCents: 2_500n,
        totalAmountInCents: 2_500n,
        createdByUserId: technicianUser.id,
        updatedByUserId: technicianUser.id,
      },
    });
    await prisma.review.create({
      data: {
        organizationId: organization.id,
        workOrderId: blocked.id,
        actorUserId: ownerUser.id,
        decision: 'CORRECTION_REQUESTED',
        reason: 'REQUIRED_PHOTO_MISSING',
      },
    });
    await prisma.workOrder.create({
      data: {
        organizationId: foreign.id,
        number: 1n,
        ...foreignRelation,
        serviceType: 'Teste',
        title: 'Ordem estrangeira',
        normalizedTitle: 'ordem estrangeira',
        description: 'Não pode aparecer.',
        status: 'PENDING_CORRECTION',
        expectedAmountInCents: 999_999n,
        actualEndAt: completedAt,
        createdByUserId: foreignUser.id,
      },
    });
  }, 20_000);

  afterAll(async () => {
    for (const organizationId of organizationIds) {
      await prisma.review.deleteMany({ where: { organizationId } });
      await prisma.additionalItem.deleteMany({ where: { organizationId } });
      await prisma.workOrderExecution.deleteMany({ where: { organizationId } });
      await prisma.workOrder.deleteMany({ where: { organizationId } });
      await prisma.serviceLocation.deleteMany({ where: { organizationId } });
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.user.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await moduleRef?.close();
  }, 20_000);

  it('reconciles stage value and blocker reason inside the tenant period', async () => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());
    const result = await dashboard.summary(owner, { from: today, to: today });
    expect(result.timezone).toBe('America/Sao_Paulo');
    expect(result.stages.PENDING_CORRECTION).toEqual({
      count: 1,
      amountInCents: 12_500n,
    });
    expect(result.blockedAmountInCents).toBe(12_500n);
    expect(result.oldestBlocked).toHaveLength(1);
    expect(result.recurringBlockers).toEqual([
      { reason: 'REQUIRED_PHOTO_MISSING', count: 1 },
    ]);
  });

  it('rejects technicians', () => {
    expect(() =>
      dashboard.summary(technician, {
        from: '2026-01-01',
        to: '2026-12-31',
      }),
    ).toThrow(WorkOrderManagementForbiddenError);
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

async function assertTestDatabase(prisma: PrismaService): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required.');
  const expected = decodeURIComponent(new URL(url).pathname.slice(1));
  const [connection] = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (connection?.database !== expected)
    throw new Error('Unexpected database.');
}

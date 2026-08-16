import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import type { AuthenticatedPrincipal } from '../../src/auth/domain/authenticated-principal';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';
import { WorkOrdersService } from '../../src/work-orders/application/work-orders.service';
import {
  WorkOrderTechnicianInvalidError,
  WorkOrderVersionConflictError,
} from '../../src/work-orders/domain/work-order.errors';

describe('Work order scheduling and assignment', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: WorkOrdersService;
  const organizationIds: string[] = [];
  let owner: AuthenticatedPrincipal;
  let relation: RelationFixture;
  let technicianId: string;
  let secondTechnicianId: string;
  let foreignTechnicianId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(WorkOrdersService);
    await assertTestDatabase(prisma);
    const suffix = `${Date.now()}-${process.pid}`;
    const [organization, foreignOrganization] = await Promise.all([
      prisma.organization.create({
        data: { name: `Schedule ${suffix}`, timezone: 'America/Sao_Paulo' },
      }),
      prisma.organization.create({
        data: { name: `Foreign schedule ${suffix}` },
      }),
    ]);
    organizationIds.push(organization.id, foreignOrganization.id);
    const [ownerRecord, technician, secondTechnician, foreignTechnician] =
      await Promise.all([
        createUser(prisma, organization.id, `owner-${suffix}`, 'OWNER'),
        createUser(
          prisma,
          organization.id,
          `technician-${suffix}`,
          'TECHNICIAN',
        ),
        createUser(
          prisma,
          organization.id,
          `technician-2-${suffix}`,
          'TECHNICIAN',
        ),
        createUser(
          prisma,
          foreignOrganization.id,
          `foreign-technician-${suffix}`,
          'TECHNICIAN',
        ),
      ]);
    owner = principal(ownerRecord.id, organization.id);
    technicianId = technician.id;
    secondTechnicianId = secondTechnician.id;
    foreignTechnicianId = foreignTechnician.id;
    relation = await createRelation(prisma, organization.id);
  }, 20_000);

  afterAll(async () => {
    if (organizationIds.length) {
      await prisma.workOrderAssignment.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
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
  }, 20_000);

  it('schedules atomically with an active same-tenant technician', async () => {
    const draft = await createDraft(
      service,
      owner,
      relation,
      'schedule-create',
    );
    const scheduled = await service.schedule(
      context(owner, 'schedule'),
      draft.id,
      {
        version: draft.version,
        technicianId,
        scheduledStartAt: new Date('2026-08-17T12:00:00.000Z'),
        scheduledEndAt: new Date('2026-08-17T14:00:00.000Z'),
      },
    );
    expect(scheduled).toMatchObject({ status: 'SCHEDULED', version: 2 });
    expect(scheduled.assignments).toMatchObject([
      { technicianId, unassignedAt: null },
    ]);
    expect(scheduled.history.at(-1)).toMatchObject({
      previousStatus: 'DRAFT',
      newStatus: 'SCHEDULED',
      reason: 'WORK_ORDER_SCHEDULED',
    });
  });

  it('rejects a technician from another organization', async () => {
    const draft = await createDraft(service, owner, relation, 'foreign-create');
    await expect(
      service.schedule(context(owner, 'foreign-schedule'), draft.id, {
        version: draft.version,
        technicianId: foreignTechnicianId,
        scheduledStartAt: new Date('2026-08-18T12:00:00.000Z'),
        scheduledEndAt: new Date('2026-08-18T13:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(WorkOrderTechnicianInvalidError);
  });

  it('preserves assignment history when rescheduling and reassigning', async () => {
    const draft = await createDraft(
      service,
      owner,
      relation,
      'reassign-create',
    );
    const scheduled = await service.schedule(
      context(owner, 'reassign-schedule'),
      draft.id,
      {
        version: draft.version,
        technicianId,
        scheduledStartAt: new Date('2026-08-19T12:00:00.000Z'),
        scheduledEndAt: new Date('2026-08-19T13:00:00.000Z'),
      },
    );
    const rescheduled = await service.reschedule(
      context(owner, 'reschedule'),
      draft.id,
      {
        version: scheduled.version,
        scheduledStartAt: new Date('2026-08-20T15:00:00.000Z'),
        scheduledEndAt: new Date('2026-08-20T17:00:00.000Z'),
      },
    );
    const reassigned = await service.reassign(
      context(owner, 'reassign'),
      draft.id,
      {
        version: rescheduled.version,
        technicianId: secondTechnicianId,
      },
    );
    expect(reassigned.assignments).toHaveLength(2);
    expect(reassigned.assignments[0]).toMatchObject({
      technicianId,
      unassignedByUserId: owner.userId,
    });
    expect(reassigned.assignments[1]).toMatchObject({
      technicianId: secondTechnicianId,
      unassignedAt: null,
    });
    expect(reassigned.history.at(-1)?.reason).toBe('WORK_ORDER_RESCHEDULED');
  });

  it('uses the organization timezone for the agenda date range', async () => {
    const draft = await createDraft(service, owner, relation, 'agenda-create');
    await service.schedule(context(owner, 'agenda-schedule'), draft.id, {
      version: draft.version,
      technicianId,
      scheduledStartAt: new Date('2026-08-21T02:30:00.000Z'),
      scheduledEndAt: new Date('2026-08-21T03:30:00.000Z'),
    });
    const previousLocalDay = await service.agenda(
      context(owner, 'agenda-before'),
      {
        from: '2026-08-20',
        to: '2026-08-20',
        technicianId,
      },
    );
    const nextLocalDay = await service.agenda(context(owner, 'agenda-after'), {
      from: '2026-08-21',
      to: '2026-08-21',
      technicianId,
    });
    expect(previousLocalDay.timezone).toBe('America/Sao_Paulo');
    expect(previousLocalDay.items.some((item) => item.id === draft.id)).toBe(
      true,
    );
    expect(nextLocalDay.items.some((item) => item.id === draft.id)).toBe(false);
  });

  it('keeps a single active assignment under concurrent scheduling', async () => {
    const draft = await createDraft(
      service,
      owner,
      relation,
      'concurrent-create',
    );
    const input = {
      version: draft.version,
      technicianId,
      scheduledStartAt: new Date('2026-08-22T12:00:00.000Z'),
      scheduledEndAt: new Date('2026-08-22T13:00:00.000Z'),
    };
    const results = await Promise.allSettled([
      service.schedule(context(owner, 'concurrent-a'), draft.id, input),
      service.schedule(context(owner, 'concurrent-b'), draft.id, {
        ...input,
        technicianId: secondTechnicianId,
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejection = results.find((result) => result.status === 'rejected');
    expect(rejection?.status).toBe('rejected');
    if (rejection?.status === 'rejected') {
      expect(rejection.reason).toBeInstanceOf(WorkOrderVersionConflictError);
    }
    await expect(
      prisma.workOrderAssignment.count({
        where: {
          organizationId: owner.organizationId,
          workOrderId: draft.id,
          unassignedAt: null,
        },
      }),
    ).resolves.toBe(1);
  });
});

interface RelationFixture {
  customerId: string;
  locationId: string;
  equipmentId: string;
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
function createDraft(
  service: WorkOrdersService,
  principalValue: AuthenticatedPrincipal,
  relationValue: RelationFixture,
  requestId: string,
) {
  return service.create(context(principalValue, requestId), {
    ...relationValue,
    serviceType: 'Manutenção',
    title: 'Atendimento planejado',
    description: 'Executar atendimento planejado.',
  });
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
async function createRelation(
  prisma: PrismaService,
  organizationId: string,
): Promise<RelationFixture> {
  const customer = await prisma.customer.create({
    data: {
      organizationId,
      name: 'Cliente agenda',
      normalizedName: 'cliente agenda',
    },
  });
  const location = await prisma.serviceLocation.create({
    data: {
      organizationId,
      customerId: customer.id,
      name: 'Local agenda',
      normalizedName: 'local agenda',
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
      name: 'Equipamento agenda',
      normalizedName: 'equipamento agenda',
      identifier: 'EQ-AGENDA',
      normalizedIdentifier: 'eq-agenda',
      category: 'Teste',
    },
  });
  return {
    customerId: customer.id,
    locationId: location.id,
    equipmentId: equipment.id,
  };
}
async function assertTestDatabase(prisma: PrismaService): Promise<void> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required.');
  const expected = decodeURIComponent(
    new URL(testDatabaseUrl).pathname.slice(1),
  );
  const [connection] = await prisma.$queryRaw<
    Array<{ database: string }>
  >`SELECT current_database() AS database`;
  if (connection?.database !== expected)
    throw new Error('Scheduling test connected to an unexpected database.');
}

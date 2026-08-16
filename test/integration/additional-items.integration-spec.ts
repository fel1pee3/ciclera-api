import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AdditionalItemsService } from '../../src/additional-items/application/additional-items.service';
import {
  AdditionalItemInvalidError,
  AdditionalItemNotFoundError,
} from '../../src/additional-items/domain/additional-item.errors';
import { AppModule } from '../../src/app.module';
import type { AuthenticatedPrincipal } from '../../src/auth/domain/authenticated-principal';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';
import { TechnicianWorkOrdersService } from '../../src/work-orders/application/technician-work-orders.service';
import { WorkOrdersService } from '../../src/work-orders/application/work-orders.service';
import { WorkOrderVersionConflictError } from '../../src/work-orders/domain/work-order.errors';

describe('Additional execution items', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let items: AdditionalItemsService;
  let office: WorkOrdersService;
  let field: TechnicianWorkOrdersService;
  let organizationId: string;
  let otherOrganizationId: string;
  let owner: AuthenticatedPrincipal;
  let technician: AuthenticatedPrincipal;
  let outsider: AuthenticatedPrincipal;
  let relation: { customerId: string; locationId: string };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    items = moduleRef.get(AdditionalItemsService);
    office = moduleRef.get(WorkOrdersService);
    field = moduleRef.get(TechnicianWorkOrdersService);
    await assertTestDatabase(prisma);
    const suffix = `${Date.now()}-${process.pid}`;
    const organization = await prisma.organization.create({
      data: { name: `Items ${suffix}` },
    });
    const other = await prisma.organization.create({
      data: { name: `Items other ${suffix}` },
    });
    organizationId = organization.id;
    otherOrganizationId = other.id;
    const ownerUser = await createUser(
      prisma,
      organizationId,
      `owner-${suffix}`,
      'OWNER',
    );
    const technicianUser = await createUser(
      prisma,
      organizationId,
      `tech-${suffix}`,
      'TECHNICIAN',
    );
    const outsiderUser = await createUser(
      prisma,
      otherOrganizationId,
      `other-${suffix}`,
      'TECHNICIAN',
    );
    owner = principal(ownerUser.id, organizationId, 'OWNER');
    technician = principal(technicianUser.id, organizationId, 'TECHNICIAN');
    outsider = principal(outsiderUser.id, otherOrganizationId, 'TECHNICIAN');
    relation = await createRelation(prisma, organizationId);
  }, 20_000);

  afterAll(async () => {
    for (const id of [organizationId, otherOrganizationId]) {
      if (!id) continue;
      await prisma.additionalItem.deleteMany({ where: { organizationId: id } });
      await prisma.evidence.deleteMany({ where: { organizationId: id } });
      await prisma.checklistResponse.deleteMany({
        where: { organizationId: id },
      });
      await prisma.workOrderExecution.deleteMany({
        where: { organizationId: id },
      });
      await prisma.workOrderAssignment.deleteMany({
        where: { organizationId: id },
      });
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

  it('calculates official totals, scopes items and serializes concurrent writes', async () => {
    const draft = await office.create(
      { principal: owner, requestId: 'items-create' },
      {
        ...relation,
        serviceType: 'Manutenção',
        title: 'Itens adicionais',
        description: 'Teste de materiais e horas.',
      },
    );
    const scheduled = await office.schedule(
      { principal: owner, requestId: 'items-schedule' },
      draft.id,
      {
        version: draft.version,
        technicianId: technician.userId,
        scheduledStartAt: new Date(Date.now() + 60_000),
        scheduledEndAt: new Date(Date.now() + 120_000),
      },
    );
    const started = await field.start(
      technician,
      'items-start',
      scheduled.id,
      scheduled.version,
    );
    const created = await items.create(technician, 'items-add', scheduled.id, {
      version: started.execution?.version ?? 0,
      type: 'MATERIAL',
      description: 'Fluido refrigerante',
      quantity: '1.5',
      unitAmountInCents: '12500',
    });
    expect(created.execution).toMatchObject({
      additionalTotalInCents: 18_750n,
      additionalItems: [
        {
          quantityInThousand: 1_500n,
          unitAmountInCents: 12_500n,
          totalAmountInCents: 18_750n,
        },
      ],
    });
    const itemId = created.execution?.additionalItems[0]?.id ?? '';

    await expect(
      items.create(technician, 'items-repeat', scheduled.id, {
        version: started.execution?.version ?? 0,
        type: 'MATERIAL',
        description: 'Duplicado',
        quantity: '1',
        unitAmountInCents: '100',
      }),
    ).rejects.toBeInstanceOf(WorkOrderVersionConflictError);
    await expect(
      items.update(outsider, 'items-cross-tenant', scheduled.id, itemId, {
        version: created.execution?.version ?? 0,
        type: 'SERVICE',
        description: 'Acesso indevido',
        quantity: '1',
        unitAmountInCents: '100',
      }),
    ).rejects.toBeInstanceOf(AdditionalItemNotFoundError);
    await expect(
      items.create(technician, 'items-invalid', scheduled.id, {
        version: created.execution?.version ?? 0,
        type: 'SERVICE',
        description: 'Inválido',
        quantity: '0',
        unitAmountInCents: '100',
      }),
    ).rejects.toBeInstanceOf(AdditionalItemInvalidError);

    const updated = await items.update(
      technician,
      'items-update',
      scheduled.id,
      itemId,
      {
        version: created.execution?.version ?? 0,
        type: 'ADDITIONAL_HOUR',
        description: 'Hora adicional',
        quantity: '0.333',
        unitAmountInCents: '100',
      },
    );
    expect(updated.execution?.additionalTotalInCents).toBe(33n);
    const admin = await office.find(
      { principal: owner, requestId: 'items-admin-find' },
      scheduled.id,
    );
    expect(admin).toMatchObject({ additionalTotalInCents: 33n });

    const removed = await items.remove(
      technician,
      'items-remove',
      scheduled.id,
      itemId,
      updated.execution?.version ?? 0,
    );
    expect(removed.execution?.additionalItems).toEqual([]);
    await expect(
      prisma.auditLog.count({
        where: {
          organizationId,
          resourceType: 'ADDITIONAL_ITEM',
        },
      }),
    ).resolves.toBe(3);
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
      street: 'Rua Campo',
      number: '10',
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
  if (connection?.database !== expected) {
    throw new Error(
      'Additional item test connected to an unexpected database.',
    );
  }
}

import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import type { AuthenticatedPrincipal } from '../../src/auth/domain/authenticated-principal';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';
import {
  TECHNICIAN_WORK_ORDER_REPOSITORY,
  type TechnicianWorkOrderRepository,
} from '../../src/work-orders/application/ports/technician-work-order.repository';
import { TechnicianWorkOrdersService } from '../../src/work-orders/application/technician-work-orders.service';
import { WorkOrdersService } from '../../src/work-orders/application/work-orders.service';
import { WorkOrderNotFoundError } from '../../src/work-orders/domain/work-order.errors';

describe('Technician assigned work orders', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let managerService: WorkOrdersService;
  let fieldService: TechnicianWorkOrdersService;
  let repository: TechnicianWorkOrderRepository;
  let organizationId: string;
  let owner: AuthenticatedPrincipal;
  let technicianA: AuthenticatedPrincipal;
  let technicianB: AuthenticatedPrincipal;
  let relation: { customerId: string; locationId: string; equipmentId: string };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    managerService = moduleRef.get(WorkOrdersService);
    fieldService = moduleRef.get(TechnicianWorkOrdersService);
    repository = moduleRef.get(TECHNICIAN_WORK_ORDER_REPOSITORY);
    await assertTestDatabase(prisma);
    const suffix = `${Date.now()}-${process.pid}`;
    const organization = await prisma.organization.create({
      data: { name: `Field ${suffix}`, timezone: 'America/Sao_Paulo' },
    });
    organizationId = organization.id;
    const [ownerUser, userA, userB] = await Promise.all([
      createUser(prisma, organizationId, `field-owner-${suffix}`, 'OWNER'),
      createUser(prisma, organizationId, `field-a-${suffix}`, 'TECHNICIAN'),
      createUser(prisma, organizationId, `field-b-${suffix}`, 'TECHNICIAN'),
    ]);
    owner = principal(ownerUser.id, organizationId, 'OWNER');
    technicianA = principal(userA.id, organizationId, 'TECHNICIAN');
    technicianB = principal(userB.id, organizationId, 'TECHNICIAN');
    relation = await createRelation(prisma, organizationId);
  }, 20_000);

  afterAll(async () => {
    if (organizationId) {
      await prisma.workOrderAssignment.deleteMany({
        where: { organizationId },
      });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.workOrderStatusHistory.deleteMany({
        where: { organizationId },
      });
      await prisma.workOrder.deleteMany({ where: { organizationId } });
      await prisma.workOrderCounter.deleteMany({ where: { organizationId } });
      await prisma.equipment.deleteMany({ where: { organizationId } });
      await prisma.serviceLocation.deleteMany({ where: { organizationId } });
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.user.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await moduleRef?.close();
  }, 20_000);

  it('lists only active assignments and rejects another technician real id', async () => {
    const [orderA, orderB] = await Promise.all([
      createScheduled(managerService, owner, technicianA.userId, relation, 'A'),
      createScheduled(managerService, owner, technicianB.userId, relation, 'B'),
    ]);
    const page = await fieldService.list(technicianA, {
      page: 1,
      pageSize: 20,
    });
    expect(page.items.map((item) => item.id)).toContain(orderA.id);
    expect(page.items.map((item) => item.id)).not.toContain(orderB.id);
    await expect(
      fieldService.find(technicianA, orderA.id),
    ).resolves.toMatchObject({
      id: orderA.id,
      customer: { name: 'Cliente field' },
    });
    await expect(
      fieldService.find(technicianA, orderB.id),
    ).rejects.toBeInstanceOf(WorkOrderNotFoundError);
  });

  it('removes an order from the former technician after reassignment', async () => {
    const order = await createScheduled(
      managerService,
      owner,
      technicianA.userId,
      relation,
      'Reassign',
    );
    await managerService.reassign(
      { principal: owner, requestId: 'field-reassign' },
      order.id,
      { version: order.version, technicianId: technicianB.userId },
    );
    await expect(
      fieldService.find(technicianA, order.id),
    ).rejects.toBeInstanceOf(WorkOrderNotFoundError);
    await expect(
      fieldService.find(technicianB, order.id),
    ).resolves.toMatchObject({
      id: order.id,
    });
    await expect(
      repository.find(organizationId, technicianA.userId, order.id),
    ).resolves.toBeNull();
  });
});

async function createScheduled(
  service: WorkOrdersService,
  owner: AuthenticatedPrincipal,
  technicianId: string,
  relation: { customerId: string; locationId: string; equipmentId: string },
  label: string,
) {
  const draft = await service.create(
    { principal: owner, requestId: `field-create-${label}` },
    {
      ...relation,
      serviceType: 'Manutenção',
      title: `Atendimento ${label}`,
      description: 'Executar atendimento em campo.',
    },
  );
  return service.schedule(
    { principal: owner, requestId: `field-schedule-${label}` },
    draft.id,
    {
      version: draft.version,
      technicianId,
      scheduledStartAt: new Date(Date.now() + 3_600_000),
      scheduledEndAt: new Date(Date.now() + 7_200_000),
    },
  );
}

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
      name: 'Cliente field',
      normalizedName: 'cliente field',
    },
  });
  const location = await prisma.serviceLocation.create({
    data: {
      organizationId,
      customerId: customer.id,
      name: 'Local field',
      normalizedName: 'local field',
      postalCode: '01000-000',
      street: 'Rua Campo',
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
      name: 'Equipamento field',
      normalizedName: 'equipamento field',
      identifier: 'EQ-FIELD',
      normalizedIdentifier: 'eq-field',
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
  const [connection] = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (connection?.database !== expected) {
    throw new Error('Field test connected to an unexpected database.');
  }
}

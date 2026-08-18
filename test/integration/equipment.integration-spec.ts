import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import type { AuthenticatedPrincipal } from '../../src/auth/domain/authenticated-principal';
import { CustomersService } from '../../src/customers/application/customers.service';
import { EquipmentService } from '../../src/equipment/application/equipment.service';
import {
  EquipmentRelationInvalidError,
  EquipmentNotFoundError,
  EquipmentSerialConflictError,
} from '../../src/equipment/domain/equipment.errors';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';

describe('Equipment persistence', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let customers: CustomersService;
  let equipment: EquipmentService;
  const organizationIds: string[] = [];
  const suffix = `${Date.now()}-${process.pid}`;
  let ownerA: AuthenticatedPrincipal;
  let ownerB: AuthenticatedPrincipal;
  let customerAId: string;
  let locationAId: string;
  let customerBId: string;
  let locationBId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    customers = moduleRef.get(CustomersService);
    equipment = moduleRef.get(EquipmentService);
    await assertTestDatabase(prisma);

    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({ data: { name: `Equipment A ${suffix}` } }),
      prisma.organization.create({ data: { name: `Equipment B ${suffix}` } }),
    ]);
    organizationIds.push(organizationA.id, organizationB.id);
    const [userA, userB] = await Promise.all([
      fixtureOwner(prisma, organizationA.id, `equipment-owner-a-${suffix}`),
      fixtureOwner(prisma, organizationB.id, `equipment-owner-b-${suffix}`),
    ]);
    ownerA = principal(userA.id, organizationA.id);
    ownerB = principal(userB.id, organizationB.id);

    const customerA = await customers.createCustomer(
      context(ownerA, 'customer-a'),
      {
        name: 'Cliente A',
      },
    );
    const customerB = await customers.createCustomer(
      context(ownerB, 'customer-b'),
      {
        name: 'Cliente B',
      },
    );
    customerAId = customerA.id;
    customerBId = customerB.id;
    locationAId = (
      await customers.createLocation(
        context(ownerA, 'location-a'),
        customerA.id,
        locationInput,
      )
    ).id;
    locationBId = (
      await customers.createLocation(
        context(ownerB, 'location-b'),
        customerB.id,
        locationInput,
      )
    ).id;
  });

  afterAll(async () => {
    if (organizationIds.length > 0) {
      await prisma.auditLog.deleteMany({
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

  it('creates, normalizes, searches, and paginates equipment', async () => {
    const created = await equipment.create(
      context(ownerA, 'equipment-create'),
      {
        customerId: customerAId,
        locationId: locationAId,
        name: '  Bomba   Principal  ',
        identifier: ' BMB-01 ',
        category: 'Bomba centrífuga',
        serialNumber: ' Serial-Único-01 ',
      },
    );

    const page = await equipment.list(context(ownerA, 'equipment-list'), {
      page: 1,
      pageSize: 1,
      search: 'bomba',
      archive: 'ACTIVE',
    });
    expect(page).toMatchObject({ page: 1, pageSize: 1 });
    expect(page.items[0]).toMatchObject({
      id: created.id,
      name: 'Bomba Principal',
      identifier: 'BMB-01',
      serialNumber: 'Serial-Único-01',
    });
  });

  it('rejects cross-tenant and mismatched customer/location relations', async () => {
    await expect(
      equipment.create(context(ownerA, 'equipment-cross-tenant'), {
        ...equipmentInput,
        customerId: customerBId,
        locationId: locationBId,
      }),
    ).rejects.toBeInstanceOf(EquipmentRelationInvalidError);

    await expect(
      equipment.create(context(ownerA, 'equipment-cross-customer'), {
        ...equipmentInput,
        customerId: customerAId,
        locationId: locationBId,
      }),
    ).rejects.toBeInstanceOf(EquipmentRelationInvalidError);

    await expect(
      prisma.equipment.create({
        data: {
          organizationId: ownerA.organizationId,
          customerId: customerAId,
          locationId: locationBId,
          name: 'Relação inválida',
          normalizedName: 'relacao invalida',
          identifier: 'INVALID',
          normalizedIdentifier: 'invalid',
          category: 'Teste',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('enforces optional serial uniqueness inside each tenant', async () => {
    await equipment.create(context(ownerA, 'serial-a'), {
      ...equipmentInput,
      customerId: customerAId,
      locationId: locationAId,
      identifier: 'SERIAL-A',
      serialNumber: 'ABC-123',
    });
    await expect(
      equipment.create(context(ownerA, 'serial-conflict'), {
        ...equipmentInput,
        customerId: customerAId,
        locationId: locationAId,
        identifier: 'SERIAL-B',
        serialNumber: 'abc-123',
      }),
    ).rejects.toBeInstanceOf(EquipmentSerialConflictError);
    await expect(
      equipment.create(context(ownerB, 'serial-other-tenant'), {
        ...equipmentInput,
        customerId: customerBId,
        locationId: locationBId,
        identifier: 'SERIAL-C',
        serialNumber: 'ABC-123',
      }),
    ).resolves.toMatchObject({ serialNumber: 'ABC-123' });

    await expect(
      Promise.all([
        equipment.create(context(ownerA, 'no-serial-1'), {
          ...equipmentInput,
          customerId: customerAId,
          locationId: locationAId,
          identifier: 'NO-SERIAL-1',
        }),
        equipment.create(context(ownerA, 'no-serial-2'), {
          ...equipmentInput,
          customerId: customerAId,
          locationId: locationAId,
          identifier: 'NO-SERIAL-2',
        }),
      ]),
    ).resolves.toHaveLength(2);
  });

  it('archives without deleting the equipment record', async () => {
    const created = await equipment.create(context(ownerA, 'archive-create'), {
      ...equipmentInput,
      customerId: customerAId,
      locationId: locationAId,
      identifier: 'ARCHIVE-01',
    });
    const archived = await equipment.archive(
      context(ownerA, 'archive-equipment'),
      created.id,
    );
    expect(archived.archivedAt).toBeInstanceOf(Date);
    await expect(
      equipment.find(context(ownerA, 'find-archived'), created.id),
    ).resolves.toMatchObject({ id: created.id });
    const page = await equipment.list(context(ownerA, 'list-archived'), {
      page: 1,
      pageSize: 20,
      archive: 'ARCHIVED',
    });
    expect(page.items.map((item) => item.id)).toContain(created.id);

    await expect(
      equipment.reactivate(
        context(ownerB, 'cross-reactivate-equipment'),
        created.id,
      ),
    ).rejects.toBeInstanceOf(EquipmentNotFoundError);
    const reactivated = await equipment.reactivate(
      context(ownerA, 'reactivate-equipment'),
      created.id,
    );
    expect(reactivated.archivedAt).toBeNull();
    await expect(
      prisma.auditLog.findFirst({
        where: {
          organizationId: ownerA.organizationId,
          resourceId: created.id,
          action: 'EQUIPMENT_REACTIVATED',
          requestId: 'reactivate-equipment',
        },
      }),
    ).resolves.not.toBeNull();
  });
});

const equipmentInput = {
  name: 'Equipamento de teste',
  identifier: 'EQ-TEST',
  category: 'Teste',
};

const locationInput = {
  name: 'Unidade de teste',
  postalCode: '01000-000',
  street: 'Rua Teste',
  number: '10',
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'SP',
};

function context(principalValue: AuthenticatedPrincipal, requestId: string) {
  return { principal: principalValue, requestId };
}

function principal(
  userId: string,
  organizationId: string,
): AuthenticatedPrincipal {
  return { userId, organizationId, role: 'OWNER', sessionId: randomUUID() };
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
    throw new Error('Equipment test connected to an unexpected database.');
  }
}

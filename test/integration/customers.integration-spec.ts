import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import type { AuthenticatedPrincipal } from '../../src/auth/domain/authenticated-principal';
import { CustomersService } from '../../src/customers/application/customers.service';
import {
  ArchivedCustomerError,
  CustomerNotFoundError,
} from '../../src/customers/domain/customer.errors';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';

describe('Customers and service locations persistence', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let customers: CustomersService;
  const organizationIds: string[] = [];
  const suffix = `${Date.now()}-${process.pid}`;
  let ownerA: AuthenticatedPrincipal;
  let ownerB: AuthenticatedPrincipal;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    customers = moduleRef.get(CustomersService);
    await assertTestDatabase(prisma);

    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({ data: { name: `Customer A ${suffix}` } }),
      prisma.organization.create({ data: { name: `Customer B ${suffix}` } }),
    ]);
    organizationIds.push(organizationA.id, organizationB.id);
    const [userA, userB] = await Promise.all([
      fixtureOwner(prisma, organizationA.id, `customer-owner-a-${suffix}`),
      fixtureOwner(prisma, organizationB.id, `customer-owner-b-${suffix}`),
    ]);
    ownerA = principal(userA.id, organizationA.id);
    ownerB = principal(userB.id, organizationB.id);
  });

  afterAll(async () => {
    if (organizationIds.length > 0) {
      await prisma.auditLog.deleteMany({
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

  it('normalizes, filters, and paginates customers in the database', async () => {
    const created = await customers.createCustomer(
      context(ownerA, 'req_customer'),
      {
        name: '  Clínica   São José  ',
        document: '12.345.678/0001-90',
        email: 'CONTATO@EXAMPLE.TEST',
        phone: '+55 (85) 93344-9080',
      },
    );
    await customers.createCustomer(context(ownerA, 'req_customer_2'), {
      name: 'Zeta Serviços',
    });

    const page = await customers.listCustomers(context(ownerA, 'req_list'), {
      page: 1,
      pageSize: 1,
      search: 'clinica sao',
      archive: 'ACTIVE',
    });
    expect(page).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    expect(page.items[0]).toMatchObject({
      id: created.id,
      name: 'Clínica São José',
      email: 'contato@example.test',
      archivedAt: null,
    });

    const stored = await prisma.customer.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.normalizedName).toBe('clinica sao jose');
    expect(stored.document).toBe('12345678000190');
    expect(stored.normalizedDocument).toBe('12345678000190');
    expect(stored.phone).toBe('5585933449080');
  });

  it('never reveals or mutates a customer from another tenant', async () => {
    const customerA = await customers.createCustomer(
      context(ownerA, 'req_tenant_a'),
      {
        name: 'Cliente isolado A',
      },
    );
    await expect(
      customers.findCustomer(context(ownerB, 'req_cross_read'), customerA.id),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
    await expect(
      customers.updateCustomer(
        context(ownerB, 'req_cross_update'),
        customerA.id,
        {
          name: 'Tentativa B',
        },
      ),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  it('enforces the composite tenant relation for service locations', async () => {
    const customerA = await customers.createCustomer(
      context(ownerA, 'req_location_a'),
      {
        name: 'Cliente com local A',
      },
    );
    const location = await customers.createLocation(
      context(ownerA, 'req_location_create'),
      customerA.id,
      locationInput,
    );
    expect(location).toMatchObject({
      customerId: customerA.id,
      name: 'Unidade Centro',
      state: 'SP',
      country: 'BR',
    });

    await expect(
      customers.createLocation(
        context(ownerB, 'req_cross_location'),
        customerA.id,
        locationInput,
      ),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);

    await expect(
      prisma.serviceLocation.create({
        data: {
          organizationId: ownerB.organizationId,
          customerId: customerA.id,
          name: 'Relação inválida',
          normalizedName: 'relacao invalida',
          postalCode: '01000-000',
          street: 'Rua Teste',
          number: '1',
          neighborhood: 'Centro',
          city: 'São Paulo',
          state: 'SP',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('archives without deleting history and blocks new locations', async () => {
    const customer = await customers.createCustomer(
      context(ownerA, 'req_archive_create'),
      {
        name: 'Cliente para arquivo',
      },
    );
    const location = await customers.createLocation(
      context(ownerA, 'req_archive_location'),
      customer.id,
      locationInput,
    );
    const archived = await customers.archiveCustomer(
      context(ownerA, 'req_archive'),
      customer.id,
    );
    expect(archived.archivedAt).toBeInstanceOf(Date);
    await expect(
      customers.createLocation(
        context(ownerA, 'req_after_archive'),
        customer.id,
        locationInput,
      ),
    ).rejects.toBeInstanceOf(ArchivedCustomerError);
    await expect(
      prisma.serviceLocation.findUnique({ where: { id: location.id } }),
    ).resolves.not.toBeNull();

    const archivedPage = await customers.listCustomers(
      context(ownerA, 'req_archived_list'),
      { page: 1, pageSize: 20, archive: 'ARCHIVED' },
    );
    expect(archivedPage.items.map((item) => item.id)).toContain(customer.id);
    await expect(
      prisma.auditLog.findFirst({
        where: {
          organizationId: ownerA.organizationId,
          resourceId: customer.id,
          action: 'CUSTOMER_ARCHIVED',
          requestId: 'req_archive',
        },
      }),
    ).resolves.not.toBeNull();

    await expect(
      customers.reactivateCustomer(
        context(ownerB, 'req_cross_reactivate'),
        customer.id,
      ),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);

    const reactivated = await customers.reactivateCustomer(
      context(ownerA, 'req_reactivate'),
      customer.id,
    );
    expect(reactivated.archivedAt).toBeNull();
    await expect(
      customers.createLocation(
        context(ownerA, 'req_after_reactivate'),
        customer.id,
        { ...locationInput, name: 'Unidade reativada' },
      ),
    ).resolves.toMatchObject({ name: 'Unidade reativada' });
    await expect(
      prisma.auditLog.findFirst({
        where: {
          organizationId: ownerA.organizationId,
          resourceId: customer.id,
          action: 'CUSTOMER_REACTIVATED',
          requestId: 'req_reactivate',
        },
      }),
    ).resolves.not.toBeNull();
  });
});

const locationInput = {
  name: ' Unidade   Centro ',
  postalCode: '01000-000',
  street: 'Rua Teste',
  number: '10',
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'sp',
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
    throw new Error(
      'Customer integration test connected to an unexpected database.',
    );
  }
}

import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import type { AuthenticatedPrincipal } from '../../src/auth/domain/authenticated-principal';
import { InitialDataImportService } from '../../src/imports/application/initial-data-import.service';
import { importHeaders } from '../../src/imports/domain/initial-data-import';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';

describe('Initial data import', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let imports: InitialDataImportService;
  const organizationIds: string[] = [];
  let owner: AuthenticatedPrincipal;
  let foreignOwner: AuthenticatedPrincipal;
  let admin: AuthenticatedPrincipal;
  let suffix: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    imports = moduleRef.get(InitialDataImportService);
    await assertTestDatabase(prisma);
    suffix = `${Date.now()}-${process.pid}`;
    const organizations = await Promise.all([
      prisma.organization.create({ data: { name: `Import ${suffix}` } }),
      prisma.organization.create({
        data: { name: `Import foreign ${suffix}` },
      }),
    ]);
    organizationIds.push(
      ...organizations.map((organization) => organization.id),
    );
    const [ownerUser, foreignOwnerUser, adminUser] = await Promise.all([
      createUser(
        prisma,
        organizations[0].id,
        `import-owner-${suffix}`,
        'OWNER',
      ),
      createUser(
        prisma,
        organizations[1].id,
        `import-foreign-${suffix}`,
        'OWNER',
      ),
      createUser(
        prisma,
        organizations[0].id,
        `import-admin-${suffix}`,
        'ADMIN',
      ),
    ]);
    owner = principal(ownerUser.id, organizations[0].id, 'OWNER');
    foreignOwner = principal(foreignOwnerUser.id, organizations[1].id, 'OWNER');
    admin = principal(adminUser.id, organizations[0].id, 'ADMIN');
  }, 20_000);

  afterAll(async () => {
    for (const organizationId of organizationIds) {
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.initialDataImport.deleteMany({ where: { organizationId } });
      await prisma.equipment.deleteMany({ where: { organizationId } });
      await prisma.serviceLocation.deleteMany({ where: { organizationId } });
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.user.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await moduleRef?.close();
  }, 20_000);

  it('previews and atomically imports the hierarchy without duplicate retries', async () => {
    const content = validCsv(suffix);
    const preview = await imports.preview(owner, content);
    expect(preview).toMatchObject({
      ready: true,
      totals: { total: 3, valid: 3, invalid: 0 },
      entities: { customers: 1, locations: 1, equipment: 1 },
    });

    const first = await imports.commit(owner, 'import-first', {
      content,
      checksum: preview.checksum,
    });
    const repeated = await imports.commit(owner, 'import-repeated', {
      content,
      checksum: preview.checksum,
    });
    expect(first.status).toBe('IMPORTED');
    expect(repeated).toEqual({ ...first, status: 'ALREADY_IMPORTED' });
    await expect(
      countImported(prisma, owner.organizationId, suffix),
    ).resolves.toEqual({
      customers: 1,
      locations: 1,
      equipment: 1,
      imports: 1,
      audits: 1,
    });
  });

  it('isolates the checksum and imported records by tenant', async () => {
    const content = validCsv(suffix);
    const preview = await imports.preview(foreignOwner, content);
    expect(preview.ready).toBe(true);
    await expect(
      imports.commit(foreignOwner, 'import-foreign', {
        content,
        checksum: preview.checksum,
      }),
    ).resolves.toMatchObject({ status: 'IMPORTED' });
    await expect(
      countImported(prisma, foreignOwner.organizationId, suffix),
    ).resolves.toMatchObject({ customers: 1, locations: 1, equipment: 1 });
  });

  it('persists nothing when any row is invalid and rejects non-owners', async () => {
    const marker = `invalid-${suffix}`;
    const content = [
      importHeaders.join(';'),
      `CLIENT;${marker};;Cliente ${marker};;;;;;;;;;;;;`,
      `LOCATION;${marker}-location;missing;Local ${marker};;01000-000;Rua A;10;;Centro;São Paulo;SP;;;;;`,
    ].join('\n');
    const preview = await imports.preview(owner, content);
    expect(preview.ready).toBe(false);
    await expect(
      imports.commit(owner, 'import-invalid', {
        content,
        checksum: preview.checksum,
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      prisma.customer.count({
        where: { organizationId: owner.organizationId, normalizedName: marker },
      }),
    ).resolves.toBe(0);
    await expect(
      imports.preview(admin, validCsv(`${suffix}-admin`)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function validCsv(marker: string) {
  return [
    importHeaders.join(';'),
    `CLIENT;customer-${marker};;Cliente ${marker};12345678900;;;;;;;;;;;;`,
    `LOCATION;location-${marker};customer-${marker};Matriz;;01000-000;Rua A;10;;Centro;São Paulo;SP;;;;;`,
    `EQUIPMENT;equipment-${marker};location-${marker};Máquina;;;;;;;;;EQ-${marker};Industrial;Marca;Modelo;SER-${marker}`,
  ].join('\r\n');
}

function principal(
  userId: string,
  organizationId: string,
  role: 'OWNER' | 'ADMIN',
): AuthenticatedPrincipal {
  return { userId, organizationId, role, sessionId: randomUUID() };
}

function createUser(
  prisma: PrismaService,
  organizationId: string,
  identity: string,
  role: 'OWNER' | 'ADMIN',
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

async function countImported(
  prisma: PrismaService,
  organizationId: string,
  marker: string,
) {
  const [customers, locations, equipment, imports, audits] = await Promise.all([
    prisma.customer.count({
      where: { organizationId, normalizedName: `cliente ${marker}` },
    }),
    prisma.serviceLocation.count({
      where: { organizationId, normalizedName: 'matriz' },
    }),
    prisma.equipment.count({
      where: { organizationId, normalizedIdentifier: `eq-${marker}` },
    }),
    prisma.initialDataImport.count({ where: { organizationId } }),
    prisma.auditLog.count({
      where: { organizationId, action: 'INITIAL_DATA_IMPORTED' },
    }),
  ]);
  return { customers, locations, equipment, imports, audits };
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
      'Initial data import test connected to an unexpected database.',
    );
  }
}

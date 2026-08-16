import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationStatus, UserRole, UserStatus } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';

describe('Identity persistence', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  const organizationIds: string[] = [];
  const suffix = `${Date.now()}-${process.pid}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);

    const expectedDatabase = databaseNameFromTestUrl();
    const [connection] = await prisma.$queryRaw<
      Array<{ databaseName: string }>
    >`SELECT current_database() AS "databaseName"`;

    if (connection?.databaseName !== expectedDatabase) {
      throw new Error('Integration tests connected to an unexpected database.');
    }
  });

  afterAll(async () => {
    if (organizationIds.length > 0) {
      await prisma.passwordResetToken.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.session.deleteMany({
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

  it('creates two organizations and keeps tenant-scoped reads isolated', async () => {
    const organizationA = await prisma.organization.create({
      data: {
        name: `Oficina A ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const organizationB = await prisma.organization.create({
      data: {
        name: `Oficina B ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    organizationIds.push(organizationA.id, organizationB.id);

    const userA = await prisma.user.create({
      data: {
        organizationId: organizationA.id,
        name: 'Owner A',
        email: `Owner.A.${suffix}@Example.com`,
        normalizedEmail: `owner.a.${suffix}@example.com`,
        passwordHash: `password-hash-a-${suffix}`,
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
      },
    });
    const userB = await prisma.user.create({
      data: {
        organizationId: organizationB.id,
        name: 'Owner B',
        email: `Owner.B.${suffix}@Example.com`,
        normalizedEmail: `owner.b.${suffix}@example.com`,
        passwordHash: `password-hash-b-${suffix}`,
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
      },
    });

    const usersFromA = await prisma.user.findMany({
      where: { organizationId: organizationA.id },
      select: { id: true, organizationId: true },
    });
    const usersFromB = await prisma.user.findMany({
      where: { organizationId: organizationB.id },
      select: { id: true, organizationId: true },
    });

    expect(usersFromA).toEqual([
      { id: userA.id, organizationId: organizationA.id },
    ]);
    expect(usersFromB).toEqual([
      { id: userB.id, organizationId: organizationB.id },
    ]);

    const session = await prisma.session.create({
      data: {
        organizationId: organizationA.id,
        userId: userA.id,
        refreshTokenHash: `refresh-token-hash-${suffix}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const passwordResetToken = await prisma.passwordResetToken.create({
      data: {
        organizationId: organizationB.id,
        userId: userB.id,
        tokenHash: `password-reset-token-hash-${suffix}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    expect(session).toMatchObject({
      organizationId: organizationA.id,
      userId: userA.id,
      revokedAt: null,
    });
    expect(passwordResetToken).toMatchObject({
      organizationId: organizationB.id,
      userId: userB.id,
      usedAt: null,
    });

    await expect(
      prisma.session.create({
        data: {
          organizationId: organizationA.id,
          userId: userB.id,
          refreshTokenHash: `cross-tenant-refresh-hash-${suffix}`,
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    await expect(
      prisma.user.create({
        data: {
          organizationId: organizationB.id,
          name: 'Duplicate normalized email',
          email: `another-${suffix}@example.com`,
          normalizedEmail: userA.normalizedEmail,
          passwordHash: `password-hash-duplicate-${suffix}`,
          role: UserRole.TECHNICIAN,
          status: UserStatus.ACTIVE,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

function databaseNameFromTestUrl(): string {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL must be set for integration tests.');
  }

  return decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
}

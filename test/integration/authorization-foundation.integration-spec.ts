import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationStatus, UserRole, UserStatus } from '@prisma/client';
import { AUTHENTICATED_USER_REPOSITORY } from '../../src/auth/application/ports/authenticated-user.repository';
import type { AuthenticatedUserRepository } from '../../src/auth/application/ports/authenticated-user.repository';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';

describe('Authorization persistence foundation', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let userRepository: AuthenticatedUserRepository;
  const organizationIds: string[] = [];
  const suffix = `${Date.now()}-${process.pid}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    userRepository = moduleRef.get<AuthenticatedUserRepository>(
      AUTHENTICATED_USER_REPOSITORY,
    );

    const [connection] = await prisma.$queryRaw<
      Array<{ databaseName: string }>
    >`SELECT current_database() AS "databaseName"`;

    if (connection?.databaseName !== databaseNameFromTestUrl()) {
      throw new Error(
        'Authorization integration test connected to an unexpected database.',
      );
    }
  });

  afterAll(async () => {
    if (organizationIds.length > 0) {
      await prisma.user.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }

    await moduleRef?.close();
  });

  it('requires the organization in the query and hides a real user from another tenant', async () => {
    const organizationA = await prisma.organization.create({
      data: {
        name: `Authorization tenant A ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const organizationB = await prisma.organization.create({
      data: {
        name: `Authorization tenant B ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    organizationIds.push(organizationA.id, organizationB.id);

    const userB = await prisma.user.create({
      data: {
        organizationId: organizationB.id,
        name: 'Cross-tenant test user',
        email: `cross-tenant-${suffix}@example.test`,
        normalizedEmail: `cross-tenant-${suffix}@example.test`,
        passwordHash: `test-only-hash-${suffix}`,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    await expect(
      userRepository.findById({
        organizationId: organizationA.id,
        userId: userB.id,
      }),
    ).resolves.toBeNull();

    const ownTenantUser = await userRepository.findById({
      organizationId: organizationB.id,
      userId: userB.id,
    });

    expect(ownTenantUser).toEqual({
      id: userB.id,
      organizationId: organizationB.id,
      role: 'ADMIN',
      status: 'ACTIVE',
      organizationStatus: 'ACTIVE',
    });
    expect(ownTenantUser).not.toHaveProperty('passwordHash');
    expect(ownTenantUser).not.toHaveProperty('email');
  });
});

function databaseNameFromTestUrl(): string {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL must be set for authorization integration tests.',
    );
  }

  return decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
}

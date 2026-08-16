import { Test, TestingModule } from '@nestjs/testing';
import { verify } from 'argon2';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { LOCAL_DEMO_PASSWORD, SEED_ORGANIZATIONS } from '../../prisma/seed';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';

describe('Local database seed', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  const organizationIds = SEED_ORGANIZATIONS.map(
    (organization) => organization.id,
  );

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);

    const [connection] = await prisma.$queryRaw<
      Array<{ databaseName: string }>
    >`SELECT current_database() AS "databaseName"`;

    if (connection?.databaseName !== databaseNameFromTestUrl()) {
      throw new Error(
        'Seed integration test connected to an unexpected database.',
      );
    }
  });

  afterAll(async () => {
    if (prisma) {
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

  it('remains deterministic after two executions and isolates both tenants', async () => {
    const organizations = await prisma.organization.findMany({
      where: { id: { in: organizationIds } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        users: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            organizationId: true,
            normalizedEmail: true,
            passwordHash: true,
            role: true,
          },
        },
      },
    });

    expect(organizations).toHaveLength(2);
    expect(organizations.map((organization) => organization.name)).toEqual([
      'Organização A — Demonstração local',
      'Organização B — Demonstração local',
    ]);

    for (const organization of organizations) {
      expect(organization.users).toHaveLength(3);
      expect(
        organization.users.every(
          (user) => user.organizationId === organization.id,
        ),
      ).toBe(true);
      expect(organization.users.map((user) => user.role).sort()).toEqual([
        'ADMIN',
        'OWNER',
        'TECHNICIAN',
      ]);
    }

    const users = organizations.flatMap((organization) => organization.users);
    expect(new Set(users.map((user) => user.id)).size).toBe(6);
    expect(new Set(users.map((user) => user.normalizedEmail)).size).toBe(6);
    expect(new Set(users.map((user) => user.passwordHash)).size).toBe(6);
    expect(
      users.every(
        (user) =>
          user.passwordHash.startsWith('$argon2id$') &&
          !user.passwordHash.includes(LOCAL_DEMO_PASSWORD),
      ),
    ).toBe(true);

    const passwordChecks = await Promise.all(
      users.map((user) => verify(user.passwordHash, LOCAL_DEMO_PASSWORD)),
    );
    expect(passwordChecks.every(Boolean)).toBe(true);

    const usersFromA = await prisma.user.findMany({
      where: { organizationId: organizationIds[0] },
      select: { organizationId: true },
    });
    const usersFromB = await prisma.user.findMany({
      where: { organizationId: organizationIds[1] },
      select: { organizationId: true },
    });
    expect(
      usersFromA.every((user) => user.organizationId === organizationIds[0]),
    ).toBe(true);
    expect(
      usersFromB.every((user) => user.organizationId === organizationIds[1]),
    ).toBe(true);
  });

  it('refuses to run in production before changing data', async () => {
    const countBefore = await countSeedUsers();
    const result = runSeedProcess({ NODE_ENV: 'production' });

    expect(result.status).not.toBe(0);
    await expect(countSeedUsers()).resolves.toBe(countBefore);
  });

  it('does not fall back to DATABASE_URL when TEST_DATABASE_URL is absent', async () => {
    const countBefore = await countSeedUsers();
    const result = runSeedProcess({
      NODE_ENV: 'test',
      TEST_DATABASE_URL: '',
    });

    expect(result.status).not.toBe(0);
    await expect(countSeedUsers()).resolves.toBe(countBefore);
  });

  function countSeedUsers(): Promise<number> {
    return prisma.user.count({
      where: { organizationId: { in: organizationIds } },
    });
  }
});

function runSeedProcess(
  environment: Readonly<Record<string, string>>,
): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    [resolve(process.cwd(), 'scripts/run-database-seed.mjs'), 'test'],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...environment },
      encoding: 'utf8',
    },
  );
}

function databaseNameFromTestUrl(): string {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL must be set for seed integration tests.',
    );
  }

  return decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
}

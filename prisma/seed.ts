import {
  OrganizationStatus,
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { argon2id, hash } from 'argon2';

type SeedEnvironment = 'development' | 'test';

interface SeedUserDefinition {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface SeedOrganizationDefinition {
  id: string;
  name: string;
  users: readonly SeedUserDefinition[];
}

export const LOCAL_DEMO_PASSWORD = 'CicleraLocalOnly!2026';

export const SEED_ORGANIZATIONS = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Organização A — Demonstração local',
    users: [
      {
        id: '10000000-0000-4000-8000-000000000101',
        name: 'Proprietário A — Demonstração local',
        email: 'owner.a@demo.ciclera.local',
        role: UserRole.OWNER,
      },
      {
        id: '10000000-0000-4000-8000-000000000102',
        name: 'Administrador A — Demonstração local',
        email: 'admin.a@demo.ciclera.local',
        role: UserRole.ADMIN,
      },
      {
        id: '10000000-0000-4000-8000-000000000103',
        name: 'Técnico A — Demonstração local',
        email: 'technician.a@demo.ciclera.local',
        role: UserRole.TECHNICIAN,
      },
    ],
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    name: 'Organização B — Demonstração local',
    users: [
      {
        id: '20000000-0000-4000-8000-000000000201',
        name: 'Proprietário B — Demonstração local',
        email: 'owner.b@demo.ciclera.local',
        role: UserRole.OWNER,
      },
      {
        id: '20000000-0000-4000-8000-000000000202',
        name: 'Administrador B — Demonstração local',
        email: 'admin.b@demo.ciclera.local',
        role: UserRole.ADMIN,
      },
      {
        id: '20000000-0000-4000-8000-000000000203',
        name: 'Técnico B — Demonstração local',
        email: 'technician.b@demo.ciclera.local',
        role: UserRole.TECHNICIAN,
      },
    ],
  },
] as const satisfies readonly SeedOrganizationDefinition[];

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  const userDefinitions = SEED_ORGANIZATIONS.flatMap((organization) =>
    organization.users.map((user) => ({
      ...user,
      organizationId: organization.id,
    })),
  );
  const passwordHashes = await Promise.all(
    userDefinitions.map(() =>
      hash(LOCAL_DEMO_PASSWORD, {
        type: argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      }),
    ),
  );

  await prisma.$transaction(async (transaction) => {
    const existingUsers = await transaction.user.findMany({
      where: {
        OR: [
          { id: { in: userDefinitions.map((user) => user.id) } },
          {
            normalizedEmail: {
              in: userDefinitions.map((user) => user.email),
            },
          },
        ],
      },
      select: { id: true, normalizedEmail: true },
    });
    const expectedIdByEmail = new Map<string, string>(
      userDefinitions.map((user) => [user.email, user.id]),
    );

    if (
      existingUsers.some(
        (user) => expectedIdByEmail.get(user.normalizedEmail) !== user.id,
      )
    ) {
      throw new Error('Seed identifiers conflict with existing local data.');
    }

    for (const organization of SEED_ORGANIZATIONS) {
      await transaction.organization.upsert({
        where: { id: organization.id },
        create: {
          id: organization.id,
          name: organization.name,
          timezone: 'America/Sao_Paulo',
          status: OrganizationStatus.ACTIVE,
        },
        update: {
          name: organization.name,
          timezone: 'America/Sao_Paulo',
          status: OrganizationStatus.ACTIVE,
        },
      });
    }

    for (const [index, user] of userDefinitions.entries()) {
      await transaction.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          organizationId: user.organizationId,
          name: user.name,
          email: user.email,
          normalizedEmail: user.email,
          passwordHash: passwordHashes[index],
          role: user.role,
          status: UserStatus.ACTIVE,
        },
        update: {
          organizationId: user.organizationId,
          name: user.name,
          email: user.email,
          normalizedEmail: user.email,
          role: user.role,
          status: UserStatus.ACTIVE,
        },
      });
    }
  });
}

async function main(): Promise<void> {
  const configuration = resolveSeedConfiguration(process.env);
  const prisma = new PrismaClient({
    datasources: { db: { url: configuration.databaseUrl } },
  });

  try {
    await seedDatabase(prisma);
    console.log(
      `Local ${configuration.environment} seed completed with 2 organizations and 6 users.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function resolveSeedConfiguration(environment: NodeJS.ProcessEnv): {
  environment: SeedEnvironment;
  databaseUrl: string;
} {
  if (environment.NODE_ENV === 'production') {
    throw new Error('Database seed is disabled in production.');
  }

  if (
    environment.NODE_ENV !== 'development' &&
    environment.NODE_ENV !== 'test'
  ) {
    throw new Error('Database seed requires NODE_ENV=development or test.');
  }

  const developmentUrlValue = environment.DATABASE_URL;
  const testUrlValue = environment.TEST_DATABASE_URL;

  if (!developmentUrlValue || !testUrlValue) {
    throw new Error('DATABASE_URL and TEST_DATABASE_URL must both be set.');
  }

  const developmentUrl = validateLocalPostgresUrl(developmentUrlValue);
  const testUrl = validateLocalPostgresUrl(testUrlValue);
  const developmentDatabase = databaseNameFrom(developmentUrl);
  const testDatabase = databaseNameFrom(testUrl);

  if (developmentDatabase === testDatabase) {
    throw new Error(
      'Development and test databases must have different names.',
    );
  }

  if (
    environment.POSTGRES_DB &&
    developmentDatabase !== environment.POSTGRES_DB
  ) {
    throw new Error('DATABASE_URL must point to POSTGRES_DB.');
  }

  if (
    environment.POSTGRES_TEST_DB &&
    testDatabase !== environment.POSTGRES_TEST_DB
  ) {
    throw new Error('TEST_DATABASE_URL must point to POSTGRES_TEST_DB.');
  }

  return {
    environment: environment.NODE_ENV,
    databaseUrl:
      environment.NODE_ENV === 'test' ? testUrlValue : developmentUrlValue,
  };
}

function validateLocalPostgresUrl(value: string): URL {
  const url = new URL(value);
  const allowedHosts = new Set(['127.0.0.1', '::1', 'localhost']);

  if (
    (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') ||
    !allowedHosts.has(url.hostname)
  ) {
    throw new Error('Database seed only accepts local PostgreSQL URLs.');
  }

  return url;
}

function databaseNameFrom(url: URL): string {
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  if (!databaseName) {
    throw new Error('Database URLs must include a database name.');
  }

  return databaseName;
}

if (require.main === module) {
  void main().catch(() => {
    console.error('Local database seed failed.');
    process.exitCode = 1;
  });
}

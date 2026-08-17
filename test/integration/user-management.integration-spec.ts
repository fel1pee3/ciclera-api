import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import type { AuthenticatedPrincipal } from '../../src/auth/domain/authenticated-principal';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';
import { UsersService } from '../../src/users/application/users.service';
import {
  LastOwnerRequiredError,
  ManagedUserNotFoundError,
  UserEmailAlreadyInUseError,
  UserManagementForbiddenError,
} from '../../src/users/domain/user-management.errors';

describe('User management persistence', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let users: UsersService;
  const organizationIds: string[] = [];
  const suffix = `${Date.now()}-${process.pid}`;
  let ownerA: AuthenticatedPrincipal;
  let adminA: AuthenticatedPrincipal;
  let ownerB: AuthenticatedPrincipal;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    await assertTestDatabase(prisma);

    const organizationA = await prisma.organization.create({
      data: { name: `Users tenant A ${suffix}` },
    });
    const organizationB = await prisma.organization.create({
      data: { name: `Users tenant B ${suffix}` },
    });
    organizationIds.push(organizationA.id, organizationB.id);

    const [createdOwnerA, createdAdminA, createdOwnerB] = await Promise.all([
      createFixtureUser(prisma, organizationA.id, 'OWNER', `owner-a-${suffix}`),
      createFixtureUser(prisma, organizationA.id, 'ADMIN', `admin-a-${suffix}`),
      createFixtureUser(prisma, organizationB.id, 'OWNER', `owner-b-${suffix}`),
    ]);
    ownerA = principal(createdOwnerA.id, organizationA.id, 'OWNER');
    adminA = principal(createdAdminA.id, organizationA.id, 'ADMIN');
    ownerB = principal(createdOwnerB.id, organizationB.id, 'OWNER');
  });

  afterAll(async () => {
    if (organizationIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
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

  it('creates, pages, filters, and audits users only inside the authenticated tenant', async () => {
    const created = await users.create(context(ownerA, 'req_create_user'), {
      name: '  Técnica   Nova  ',
      email: `NEW-TECH-${suffix}@example.test`,
      password: 'LocalOnly!2026',
      role: 'TECHNICIAN',
    });

    const page = await users.list(context(ownerA, 'req_list_users'), {
      page: 1,
      pageSize: 1,
      search: `new-tech-${suffix}`,
      role: 'TECHNICIAN',
      status: 'ACTIVE',
    });
    expect(page).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    expect(page.items[0]).toMatchObject({
      id: created.id,
      name: 'Técnica Nova',
      role: 'TECHNICIAN',
      status: 'ACTIVE',
    });
    expect(page.items[0]).not.toHaveProperty('passwordHash');

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        organizationId: ownerA.organizationId,
        resourceId: created.id,
        action: 'USER_CREATED',
      },
    });
    expect(audit).toMatchObject({
      actorUserId: ownerA.userId,
      requestId: 'req_create_user',
      resourceType: 'USER',
    });
    expect(JSON.stringify(audit.metadata)).not.toContain('password');

    await expect(
      users.find(context(ownerB, 'req_cross_tenant'), created.id),
    ).rejects.toBeInstanceOf(ManagedUserNotFoundError);
  });

  it('enforces the explicit ADMIN policy', async () => {
    await expect(
      users.find(context(adminA, 'req_admin_owner'), ownerA.userId),
    ).rejects.toBeInstanceOf(UserManagementForbiddenError);

    await expect(
      users.create(context(adminA, 'req_admin_create_admin'), {
        name: 'Administrador proibido',
        email: `admin-forbidden-${suffix}@example.test`,
        password: 'LocalOnly!2026',
        role: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(UserManagementForbiddenError);

    await expect(
      users.create(context(adminA, 'req_admin_create_tech'), {
        name: 'Técnico permitido',
        email: `admin-tech-${suffix}@example.test`,
        password: 'LocalOnly!2026',
        role: 'TECHNICIAN',
      }),
    ).resolves.toMatchObject({ role: 'TECHNICIAN' });
  });

  it('honors globally unique normalized e-mail addresses', async () => {
    const email = `global-${suffix}@example.test`;
    await users.create(context(ownerA, 'req_global_a'), {
      name: 'Global A',
      email,
      password: 'LocalOnly!2026',
      role: 'TECHNICIAN',
    });

    await expect(
      users.create(context(ownerB, 'req_global_b'), {
        name: 'Global B',
        email: email.toUpperCase(),
        password: 'LocalOnly!2026',
        role: 'TECHNICIAN',
      }),
    ).rejects.toBeInstanceOf(UserEmailAlreadyInUseError);
  });

  it('protects the last active OWNER atomically', async () => {
    await expect(
      users.setStatus(
        context(ownerB, 'req_last_owner'),
        ownerB.userId,
        'INACTIVE',
      ),
    ).rejects.toBeInstanceOf(LastOwnerRequiredError);
    await expect(
      users.update(context(ownerB, 'req_last_owner_role'), ownerB.userId, {
        role: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(LastOwnerRequiredError);
  });

  it('updates access data, revokes sessions, and audits sensitive changes', async () => {
    const target = await users.create(context(ownerA, 'req_target_create'), {
      name: 'Alvo de alteração',
      email: `target-${suffix}@example.test`,
      password: 'LocalOnly!2026',
      role: 'TECHNICIAN',
    });
    const session = await prisma.session.create({
      data: {
        organizationId: ownerA.organizationId,
        userId: target.id,
        refreshTokenHash: `integration-refresh-${suffix}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await users.update(context(ownerA, 'req_role_change'), target.id, {
      role: 'ADMIN',
      email: `updated-target-${suffix}@example.test`,
      password: 'UpdatedLocal!2026',
    });
    await users.setStatus(
      context(ownerA, 'req_status_change'),
      target.id,
      'INACTIVE',
    );

    const [storedUser, storedSession, audits] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        select: { email: true, normalizedEmail: true, passwordHash: true },
      }),
      prisma.session.findUniqueOrThrow({ where: { id: session.id } }),
      prisma.auditLog.findMany({
        where: {
          organizationId: ownerA.organizationId,
          resourceId: target.id,
          action: {
            in: [
              'USER_ROLE_CHANGED',
              'USER_EMAIL_CHANGED',
              'USER_PASSWORD_CHANGED',
              'USER_DEACTIVATED',
            ],
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    expect(storedUser).toMatchObject({
      email: `updated-target-${suffix}@example.test`,
      normalizedEmail: `updated-target-${suffix}@example.test`,
    });
    expect(storedUser.passwordHash).not.toContain('UpdatedLocal!2026');
    expect(storedSession).toMatchObject({
      revocationReason: 'PASSWORD_CHANGED',
    });
    expect(storedSession.revokedAt).toBeInstanceOf(Date);
    expect(audits.map((audit) => audit.requestId)).toEqual([
      'req_role_change',
      'req_role_change',
      'req_role_change',
      'req_status_change',
    ]);
  });
});

function context(principalValue: AuthenticatedPrincipal, requestId: string) {
  return { principal: principalValue, requestId };
}

function principal(
  userId: string,
  organizationId: string,
  role: AuthenticatedPrincipal['role'],
): AuthenticatedPrincipal {
  return { userId, organizationId, role, sessionId: randomUUID() };
}

function createFixtureUser(
  prisma: PrismaService,
  organizationId: string,
  role: AuthenticatedPrincipal['role'],
  identity: string,
) {
  const email = `${identity}@example.test`.toLowerCase();
  return prisma.user.create({
    data: {
      organizationId,
      name: identity,
      email,
      normalizedEmail: email,
      passwordHash: `integration-only-${identity}`,
      role,
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
      'User integration test connected to an unexpected database.',
    );
  }
}

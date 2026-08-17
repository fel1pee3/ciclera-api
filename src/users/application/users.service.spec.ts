import type { PasswordHasher } from '../../auth/application/ports/password-hasher.port';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import type { PaginatedUsers, UserRepository } from './ports/user.repository';
import { UsersService } from './users.service';
import {
  LastOwnerRequiredError,
  UserEmailAlreadyInUseError,
  UserManagementForbiddenError,
} from '../domain/user-management.errors';

describe('UsersService', () => {
  let repository: jest.Mocked<UserRepository>;
  let passwords: jest.Mocked<PasswordHasher>;
  let service: UsersService;

  beforeEach(() => {
    repository = {
      list: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      setStatus: jest.fn(),
    };
    passwords = {
      hash: jest.fn().mockResolvedValue('argon2-test-hash'),
      verify: jest.fn(),
      performDummyVerification: jest.fn(),
    };
    service = new UsersService(repository, passwords);
  });

  it('always scopes listings to the authenticated organization', async () => {
    const result: PaginatedUsers = {
      items: [],
      page: 2,
      pageSize: 10,
      total: 0,
    };
    repository.list.mockResolvedValue(result);

    await expect(
      service.list(ownerContext, { page: 2, pageSize: 10 }),
    ).resolves.toBe(result);
    expect(repository.list.mock.calls[0]?.[0]).toEqual({
      organizationId: owner.organizationId,
      page: 2,
      pageSize: 10,
    });
  });

  it('allows ADMIN to create only technicians', async () => {
    await expect(
      service.create(adminContext, {
        name: 'Outro administrador',
        email: 'admin2@example.test',
        password: 'LocalOnly!2026',
        role: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(UserManagementForbiddenError);
    expect(passwords.hash.mock.calls).toHaveLength(0);
  });

  it('never allows TECHNICIAN to manage users', async () => {
    await expect(
      service.list(technicianContext, { page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(UserManagementForbiddenError);
    expect(repository.list.mock.calls).toHaveLength(0);
  });

  it('normalizes identity inputs and converts a global e-mail conflict', async () => {
    repository.create.mockResolvedValue({ status: 'EMAIL_CONFLICT' });

    await expect(
      service.create(ownerContext, {
        name: '  Pessoa   Nova  ',
        email: ' New.User@Example.Test ',
        password: 'LocalOnly!2026',
        role: 'TECHNICIAN',
      }),
    ).rejects.toBeInstanceOf(UserEmailAlreadyInUseError);
    expect(repository.create.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        organizationId: owner.organizationId,
        actorUserId: owner.userId,
        name: 'Pessoa Nova',
        email: 'new.user@example.test',
        normalizedEmail: 'new.user@example.test',
        passwordHash: 'argon2-test-hash',
      }),
    );
  });

  it('surfaces the atomic last-owner protection', async () => {
    repository.findById.mockResolvedValue(ownerUser);
    repository.setStatus.mockResolvedValue({ status: 'LAST_OWNER' });

    await expect(
      service.setStatus(ownerContext, owner.userId, 'INACTIVE'),
    ).rejects.toBeInstanceOf(LastOwnerRequiredError);
  });

  it('normalizes e-mail and hashes a new password during updates', async () => {
    repository.findById.mockResolvedValue(ownerUser);
    repository.update.mockResolvedValue({
      status: 'UPDATED',
      user: { ...ownerUser, email: 'updated@example.test' },
    });

    await service.update(ownerContext, owner.userId, {
      email: ' Updated@Example.Test ',
      password: 'NewLocal!2026',
    });

    expect(passwords.hash.mock.calls).toEqual([['NewLocal!2026']]);
    expect(repository.update.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        organizationId: owner.organizationId,
        userId: owner.userId,
        email: 'updated@example.test',
        normalizedEmail: 'updated@example.test',
        passwordHash: 'argon2-test-hash',
      }),
    );
  });
});

const owner: AuthenticatedPrincipal = {
  userId: '10000000-0000-4000-8000-000000000101',
  organizationId: '10000000-0000-4000-8000-000000000001',
  role: 'OWNER',
  sessionId: '30000000-0000-4000-8000-000000000001',
};
const admin: AuthenticatedPrincipal = { ...owner, role: 'ADMIN' };
const technician: AuthenticatedPrincipal = { ...owner, role: 'TECHNICIAN' };
const ownerContext = { principal: owner, requestId: 'req_owner' };
const adminContext = { principal: admin, requestId: 'req_admin' };
const technicianContext = {
  principal: technician,
  requestId: 'req_technician',
};
const now = new Date('2026-08-16T00:00:00.000Z');
const ownerUser = {
  id: owner.userId,
  name: 'Proprietário',
  email: 'owner@example.test',
  role: 'OWNER' as const,
  status: 'ACTIVE' as const,
  createdAt: now,
  updatedAt: now,
};

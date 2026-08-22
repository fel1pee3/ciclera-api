import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { normalizeEmail } from '../../auth/application/auth.service';
import { PASSWORD_HASHER } from '../../auth/application/ports/password-hasher.port';
import type { PasswordHasher } from '../../auth/application/ports/password-hasher.port';
import type { UserRole } from '../../auth/domain/authenticated-principal';
import type { UserStatus } from '../domain/managed-user';
import {
  EmptyUserUpdateError,
  LastOwnerRequiredError,
  ManagedUserNotFoundError,
  UserEmailAlreadyInUseError,
  UserManagementForbiddenError,
} from '../domain/user-management.errors';
import {
  USER_REPOSITORY,
  type ListUsersInput,
  type UserRepository,
} from './ports/user.repository';
import { SubscriptionEntitlementsService } from '../../subscriptions/application/subscription-entitlements.service';

interface RequestContext {
  principal: AuthenticatedPrincipal;
  requestId: string;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    private readonly entitlements: SubscriptionEntitlementsService,
  ) {}

  async list(
    context: RequestContext,
    query: Omit<ListUsersInput, 'organizationId'>,
  ) {
    this.requireManager(context.principal);
    return await this.users.list({
      ...query,
      organizationId: context.principal.organizationId,
    });
  }

  async find(context: RequestContext, userId: string) {
    this.requireManager(context.principal);
    const user = await this.users.findById(
      context.principal.organizationId,
      userId,
    );
    if (!user) throw new ManagedUserNotFoundError();
    this.requireCanManage(context.principal, user.role);
    return user;
  }

  async create(
    context: RequestContext,
    input: { name: string; email: string; password: string; role: UserRole },
  ) {
    this.requireCanManage(context.principal, input.role);
    await this.entitlements.assertUserSeat(
      context.principal.organizationId,
      input.role,
    );
    const email = normalizeEmail(input.email);
    const result = await this.users.create({
      organizationId: context.principal.organizationId,
      actorUserId: context.principal.userId,
      requestId: context.requestId,
      name: normalizeName(input.name),
      email,
      normalizedEmail: email,
      passwordHash: await this.passwords.hash(input.password),
      role: input.role,
    });
    if (result.status === 'EMAIL_CONFLICT') {
      throw new UserEmailAlreadyInUseError();
    }
    return result.user;
  }

  async update(
    context: RequestContext,
    userId: string,
    input: {
      name?: string;
      email?: string;
      password?: string;
      role?: UserRole;
    },
  ) {
    if (
      input.name === undefined &&
      input.email === undefined &&
      input.password === undefined &&
      input.role === undefined
    ) {
      throw new EmptyUserUpdateError();
    }
    const target = await this.find(context, userId);
    if (input.role) this.requireCanManage(context.principal, input.role);
    if (
      input.role &&
      target.status === 'ACTIVE' &&
      seatCategory(input.role) !== seatCategory(target.role)
    ) {
      await this.entitlements.assertUserSeat(
        context.principal.organizationId,
        input.role,
      );
    }
    const email =
      input.email === undefined ? undefined : normalizeEmail(input.email);
    const result = await this.users.update({
      organizationId: context.principal.organizationId,
      actorUserId: context.principal.userId,
      requestId: context.requestId,
      userId,
      ...(input.name === undefined ? {} : { name: normalizeName(input.name) }),
      ...(email === undefined ? {} : { email, normalizedEmail: email }),
      ...(input.password === undefined
        ? {}
        : { passwordHash: await this.passwords.hash(input.password) }),
      ...(input.role === undefined ? {} : { role: input.role }),
    });
    return resolveUpdateResult(result, target);
  }

  async setStatus(context: RequestContext, userId: string, status: UserStatus) {
    const target = await this.find(context, userId);
    if (target.status === 'INACTIVE' && status === 'ACTIVE') {
      await this.entitlements.assertUserSeat(
        context.principal.organizationId,
        target.role,
      );
    }
    const result = await this.users.setStatus({
      organizationId: context.principal.organizationId,
      actorUserId: context.principal.userId,
      requestId: context.requestId,
      userId,
      status,
    });
    return resolveUpdateResult(result, target);
  }

  async delete(context: RequestContext, userId: string) {
    const target = await this.find(context, userId);
    const result = await this.users.deleteUser({
      organizationId: context.principal.organizationId,
      actorUserId: context.principal.userId,
      requestId: context.requestId,
      userId,
    });
    if (result.status === 'NOT_FOUND') throw new ManagedUserNotFoundError();
    return result.status === 'DELETED' ? result.user : target;
  }

  private requireManager(principal: AuthenticatedPrincipal): void {
    if (principal.role === 'TECHNICIAN') {
      throw new UserManagementForbiddenError();
    }
  }

  private requireCanManage(
    principal: AuthenticatedPrincipal,
    targetRole: UserRole,
  ): void {
    this.requireManager(principal);
    if (targetRole === 'OWNER') {
      throw new UserManagementForbiddenError();
    }
    if (principal.role === 'ADMIN' && targetRole !== 'TECHNICIAN') {
      throw new UserManagementForbiddenError();
    }
  }
}

function seatCategory(role: UserRole): 'TECHNICIAN' | 'ADMINISTRATIVE' {
  return role === 'TECHNICIAN' ? 'TECHNICIAN' : 'ADMINISTRATIVE';
}

function resolveUpdateResult<T>(
  result:
    | { status: 'UPDATED'; user: T }
    | { status: 'NOT_FOUND' }
    | { status: 'LAST_OWNER' }
    | { status: 'EMAIL_CONFLICT' },
  previous: T,
): T {
  if (result.status === 'NOT_FOUND') throw new ManagedUserNotFoundError();
  if (result.status === 'LAST_OWNER') throw new LastOwnerRequiredError();
  if (result.status === 'EMAIL_CONFLICT') {
    throw new UserEmailAlreadyInUseError();
  }
  return result.status === 'UPDATED' ? result.user : previous;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

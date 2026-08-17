import type { UserRole } from '../../../auth/domain/authenticated-principal';
import type { ManagedUser, UserStatus } from '../../domain/managed-user';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface AuditContext {
  actorUserId: string;
  requestId: string;
}

export interface ListUsersInput {
  organizationId: string;
  page: number;
  pageSize: number;
  search?: string;
  role?: UserRole;
  status?: UserStatus;
}

export interface PaginatedUsers {
  items: ManagedUser[];
  page: number;
  pageSize: number;
  total: number;
}

export type CreateUserResult =
  { status: 'CREATED'; user: ManagedUser } | { status: 'EMAIL_CONFLICT' };

export type UpdateUserResult =
  | { status: 'UPDATED'; user: ManagedUser }
  | { status: 'NOT_FOUND' }
  | { status: 'LAST_OWNER' }
  | { status: 'EMAIL_CONFLICT' };

export interface UserRepository {
  list(input: ListUsersInput): Promise<PaginatedUsers>;
  findById(organizationId: string, userId: string): Promise<ManagedUser | null>;
  create(
    input: {
      organizationId: string;
      name: string;
      email: string;
      normalizedEmail: string;
      passwordHash: string;
      role: UserRole;
    } & AuditContext,
  ): Promise<CreateUserResult>;
  update(
    input: {
      organizationId: string;
      userId: string;
      name?: string;
      email?: string;
      normalizedEmail?: string;
      passwordHash?: string;
      role?: UserRole;
    } & AuditContext,
  ): Promise<UpdateUserResult>;
  setStatus(
    input: {
      organizationId: string;
      userId: string;
      status: UserStatus;
    } & AuditContext,
  ): Promise<UpdateUserResult>;
}

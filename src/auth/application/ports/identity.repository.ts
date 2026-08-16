import { UserRole } from '../../domain/authenticated-principal';
import { IdentityStatus } from './authenticated-user.repository';

export const IDENTITY_REPOSITORY = Symbol('IDENTITY_REPOSITORY');

export interface AuthenticatedAccount {
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
  organization: {
    id: string;
    name: string;
    timezone: string;
  };
}

export interface LoginIdentity extends AuthenticatedAccount {
  normalizedEmail: string;
  passwordHash: string;
  userStatus: IdentityStatus;
  organizationStatus: IdentityStatus;
}

export interface FindAccountInput {
  organizationId: string;
  userId: string;
}

export interface IdentityRepository {
  findByNormalizedEmail(normalizedEmail: string): Promise<LoginIdentity | null>;
  findAccount(input: FindAccountInput): Promise<AuthenticatedAccount | null>;
}

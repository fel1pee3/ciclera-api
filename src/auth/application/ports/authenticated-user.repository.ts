import { UserRole } from '../../domain/authenticated-principal';

export const AUTHENTICATED_USER_REPOSITORY = Symbol(
  'AUTHENTICATED_USER_REPOSITORY',
);

export type IdentityStatus = 'ACTIVE' | 'INACTIVE';

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  role: UserRole;
  status: IdentityStatus;
  organizationStatus: IdentityStatus;
}

export interface FindAuthenticatedUserInput {
  organizationId: string;
  userId: string;
}

export interface AuthenticatedUserRepository {
  findById(
    input: FindAuthenticatedUserInput,
  ): Promise<AuthenticatedUser | null>;
}

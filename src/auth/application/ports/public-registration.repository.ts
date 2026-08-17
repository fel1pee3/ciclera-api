import type { AuthenticatedAccount } from './identity.repository';

export const PUBLIC_REGISTRATION_REPOSITORY = Symbol(
  'PUBLIC_REGISTRATION_REPOSITORY',
);

export interface CreatePublicRegistrationInput {
  organizationId: string;
  organizationName: string;
  ownerId: string;
  ownerName: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string;
  timezone: string;
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: Date;
  sessionId: string;
  familyId: string;
  refreshTokenHash: string;
  sessionExpiresAt: Date;
  requestId: string;
}

export type CreatePublicRegistrationResult =
  | { status: 'CREATED'; account: AuthenticatedAccount }
  | { status: 'EMAIL_CONFLICT' };

export interface PublicRegistrationRepository {
  create(
    input: CreatePublicRegistrationInput,
  ): Promise<CreatePublicRegistrationResult>;
}

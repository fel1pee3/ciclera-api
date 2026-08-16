export const PASSWORD_RESET_REPOSITORY = Symbol('PASSWORD_RESET_REPOSITORY');

export interface CreatePasswordResetInput {
  normalizedEmail: string;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
}

export interface PasswordResetRecipient {
  email: string;
}

export interface ConsumePasswordResetInput {
  tokenHash: string;
  passwordHash: string;
  now: Date;
}

export interface InvalidatePasswordResetInput {
  tokenHash: string;
  now: Date;
}

export interface PasswordResetRepository {
  create(
    input: CreatePasswordResetInput,
  ): Promise<PasswordResetRecipient | null>;
  consume(input: ConsumePasswordResetInput): Promise<boolean>;
  invalidate(input: InvalidatePasswordResetInput): Promise<void>;
}

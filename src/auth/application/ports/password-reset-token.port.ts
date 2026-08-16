export const PASSWORD_RESET_TOKEN_SERVICE = Symbol(
  'PASSWORD_RESET_TOKEN_SERVICE',
);

export interface CreatedPasswordResetToken {
  token: string;
  tokenHash: string;
}

export interface PasswordResetTokenService {
  create(): CreatedPasswordResetToken;
  hash(token: string): string | null;
}

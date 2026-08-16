export const AUTH_CONFIGURATION = Symbol('AUTH_CONFIGURATION');

export interface AuthConfiguration {
  refreshTokenTtlSeconds: number;
  passwordResetTokenTtlSeconds: number;
  webUrl: string;
}

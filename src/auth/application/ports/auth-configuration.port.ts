export const AUTH_CONFIGURATION = Symbol('AUTH_CONFIGURATION');

export interface AuthConfiguration {
  refreshTokenTtlSeconds: number;
}

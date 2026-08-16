import { ResolvedSession } from './session-resolver.port';

export const ACCESS_TOKEN_SERVICE = Symbol('ACCESS_TOKEN_SERVICE');
export const REFRESH_TOKEN_SERVICE = Symbol('REFRESH_TOKEN_SERVICE');

export interface AccessTokenService {
  issue(session: ResolvedSession): Promise<string>;
  verify(token: string): Promise<ResolvedSession | null>;
}

export interface CreatedRefreshToken {
  sessionId: string;
  token: string;
  tokenHash: string;
}

export interface ParsedRefreshToken {
  sessionId: string;
  tokenHash: string;
}

export interface RefreshTokenService {
  create(): CreatedRefreshToken;
  parse(token: string): ParsedRefreshToken | null;
  hashesMatch(storedHash: string, presentedHash: string): boolean;
}

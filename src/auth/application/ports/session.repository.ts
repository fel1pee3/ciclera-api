import { ResolvedSession } from './session-resolver.port';

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

export interface CreateSessionInput extends ResolvedSession {
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  now: Date;
}

export interface RotateSessionInput {
  currentSessionId: string;
  currentRefreshTokenHash: string;
  nextSessionId: string;
  nextRefreshTokenHash: string;
  nextExpiresAt: Date;
  now: Date;
}

export type RotateSessionResult =
  | { status: 'ROTATED'; session: ResolvedSession }
  | { status: 'INVALID' }
  | { status: 'REUSED' };

export interface RevokeCurrentSessionInput {
  sessionId: string;
  refreshTokenHash: string;
  now: Date;
}

export interface RevokeAllSessionsInput {
  organizationId: string;
  userId: string;
  now: Date;
}

export interface FindActiveSessionInput extends ResolvedSession {
  now: Date;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<boolean>;
  rotate(input: RotateSessionInput): Promise<RotateSessionResult>;
  revokeCurrent(input: RevokeCurrentSessionInput): Promise<void>;
  revokeAll(input: RevokeAllSessionsInput): Promise<void>;
  findActive(input: FindActiveSessionInput): Promise<ResolvedSession | null>;
}

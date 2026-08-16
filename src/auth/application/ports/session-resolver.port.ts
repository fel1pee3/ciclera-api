export const SESSION_RESOLVER = Symbol('SESSION_RESOLVER');

export interface SessionResolutionInput {
  authorization?: string;
  cookie?: string;
}

export interface ResolvedSession {
  sessionId: string;
  userId: string;
  organizationId: string;
}

export interface SessionResolver {
  /** Returns only a trusted, valid, non-expired and non-revoked session. */
  resolveSession(
    input: SessionResolutionInput,
  ): Promise<ResolvedSession | null>;
}

import { Inject, Injectable } from '@nestjs/common';
import { SESSION_REPOSITORY } from '../application/ports/session.repository';
import type { SessionRepository } from '../application/ports/session.repository';
import {
  ResolvedSession,
  SessionResolutionInput,
  SessionResolver,
} from '../application/ports/session-resolver.port';
import { ACCESS_TOKEN_SERVICE } from '../application/ports/token-services.port';
import type { AccessTokenService } from '../application/ports/token-services.port';
import { accessCookieName, readCookie } from '../http/auth-cookies';

@Injectable()
export class DatabaseSessionResolver implements SessionResolver {
  constructor(
    @Inject(ACCESS_TOKEN_SERVICE)
    private readonly accessTokens: AccessTokenService,
    @Inject(SESSION_REPOSITORY)
    private readonly sessions: SessionRepository,
  ) {}

  async resolveSession(
    input: SessionResolutionInput,
  ): Promise<ResolvedSession | null> {
    const token = readCookie(input.cookie, accessCookieName);

    if (!token) {
      return null;
    }

    const claims = await this.accessTokens.verify(token);

    if (!claims) {
      return null;
    }

    return this.sessions.findActive({ ...claims, now: new Date() });
  }
}

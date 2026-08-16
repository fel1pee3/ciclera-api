import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthenticatedPrincipal } from '../domain/authenticated-principal';
import { AuthenticationRejectedError } from '../domain/authentication-rejected.error';
import { AUTH_CONFIGURATION } from './ports/auth-configuration.port';
import type { AuthConfiguration } from './ports/auth-configuration.port';
import {
  AuthenticatedAccount,
  IDENTITY_REPOSITORY,
} from './ports/identity.repository';
import type { IdentityRepository } from './ports/identity.repository';
import { PASSWORD_HASHER } from './ports/password-hasher.port';
import type { PasswordHasher } from './ports/password-hasher.port';
import { SESSION_REPOSITORY } from './ports/session.repository';
import type { SessionRepository } from './ports/session.repository';
import {
  ACCESS_TOKEN_SERVICE,
  REFRESH_TOKEN_SERVICE,
} from './ports/token-services.port';
import type {
  AccessTokenService,
  RefreshTokenService,
} from './ports/token-services.port';

export interface IssuedAuthentication {
  account: AuthenticatedAccount;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshedAuthentication {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly refreshTokenTtlMilliseconds: number;

  constructor(
    @Inject(IDENTITY_REPOSITORY)
    private readonly identities: IdentityRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwords: PasswordHasher,
    @Inject(SESSION_REPOSITORY)
    private readonly sessions: SessionRepository,
    @Inject(ACCESS_TOKEN_SERVICE)
    private readonly accessTokens: AccessTokenService,
    @Inject(REFRESH_TOKEN_SERVICE)
    private readonly refreshTokens: RefreshTokenService,
    @Inject(AUTH_CONFIGURATION)
    configuration: AuthConfiguration,
  ) {
    this.refreshTokenTtlMilliseconds =
      configuration.refreshTokenTtlSeconds * 1_000;
  }

  async login(email: string, password: string): Promise<IssuedAuthentication> {
    const identity = await this.identities.findByNormalizedEmail(
      normalizeEmail(email),
    );

    if (!identity) {
      await this.passwords.performDummyVerification(password);
      throw new AuthenticationRejectedError();
    }

    const passwordMatches = await this.passwords.verify(
      identity.passwordHash,
      password,
    );

    if (
      !passwordMatches ||
      identity.userStatus !== 'ACTIVE' ||
      identity.organizationStatus !== 'ACTIVE'
    ) {
      throw new AuthenticationRejectedError();
    }

    const now = new Date();
    const refreshToken = this.refreshTokens.create();
    const session = {
      sessionId: refreshToken.sessionId,
      userId: identity.user.id,
      organizationId: identity.organization.id,
    };
    const accessToken = await this.accessTokens.issue(session);
    const created = await this.sessions.create({
      ...session,
      familyId: randomUUID(),
      refreshTokenHash: refreshToken.tokenHash,
      expiresAt: new Date(now.getTime() + this.refreshTokenTtlMilliseconds),
      now,
    });

    if (!created) {
      throw new AuthenticationRejectedError();
    }

    return {
      account: {
        user: identity.user,
        organization: identity.organization,
      },
      accessToken,
      refreshToken: refreshToken.token,
    };
  }

  async currentAccount(
    principal: AuthenticatedPrincipal,
  ): Promise<AuthenticatedAccount> {
    const account = await this.identities.findAccount({
      organizationId: principal.organizationId,
      userId: principal.userId,
    });

    if (!account) {
      throw new AuthenticationRejectedError();
    }

    return account;
  }

  async refresh(token: string | undefined): Promise<RefreshedAuthentication> {
    const current = token ? this.refreshTokens.parse(token) : null;

    if (!current) {
      throw new AuthenticationRejectedError();
    }

    const now = new Date();
    const next = this.refreshTokens.create();
    const result = await this.sessions.rotate({
      currentSessionId: current.sessionId,
      currentRefreshTokenHash: current.tokenHash,
      nextSessionId: next.sessionId,
      nextRefreshTokenHash: next.tokenHash,
      nextExpiresAt: new Date(now.getTime() + this.refreshTokenTtlMilliseconds),
      now,
    });

    if (result.status !== 'ROTATED') {
      throw new AuthenticationRejectedError();
    }

    return {
      accessToken: await this.accessTokens.issue(result.session),
      refreshToken: next.token,
    };
  }

  async logout(token: string | undefined): Promise<void> {
    const current = token ? this.refreshTokens.parse(token) : null;

    if (!current) {
      return;
    }

    await this.sessions.revokeCurrent({
      sessionId: current.sessionId,
      refreshTokenHash: current.tokenHash,
      now: new Date(),
    });
  }

  async logoutAll(principal: AuthenticatedPrincipal): Promise<void> {
    await this.sessions.revokeAll({
      organizationId: principal.organizationId,
      userId: principal.userId,
      now: new Date(),
    });
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

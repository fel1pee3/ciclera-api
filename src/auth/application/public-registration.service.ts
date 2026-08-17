import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { normalizeEmail } from './auth.service';
import type { IssuedAuthentication } from './auth.service';
import { AUTH_CONFIGURATION } from './ports/auth-configuration.port';
import type { AuthConfiguration } from './ports/auth-configuration.port';
import { PASSWORD_HASHER } from './ports/password-hasher.port';
import type { PasswordHasher } from './ports/password-hasher.port';
import {
  PUBLIC_REGISTRATION_REPOSITORY,
  type PublicRegistrationRepository,
} from './ports/public-registration.repository';
import {
  ACCESS_TOKEN_SERVICE,
  REFRESH_TOKEN_SERVICE,
} from './ports/token-services.port';
import type {
  AccessTokenService,
  RefreshTokenService,
} from './ports/token-services.port';
import { PublicRegistrationEmailConflictError } from '../domain/public-registration.errors';

export const currentLegalVersion = '2026-08-17';
export const defaultOrganizationTimezone = 'America/Sao_Paulo';

export interface PublicRegistrationInput {
  organizationName: string;
  ownerName: string;
  email: string;
  password: string;
  termsVersion: string;
  requestId: string;
}

@Injectable()
export class PublicRegistrationService {
  private readonly refreshTokenTtlMilliseconds: number;

  constructor(
    @Inject(PUBLIC_REGISTRATION_REPOSITORY)
    private readonly registrations: PublicRegistrationRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwords: PasswordHasher,
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

  async register(
    input: PublicRegistrationInput,
  ): Promise<IssuedAuthentication> {
    const now = new Date();
    const organizationId = randomUUID();
    const ownerId = randomUUID();
    const refreshToken = this.refreshTokens.create();
    const session = {
      sessionId: refreshToken.sessionId,
      organizationId,
      userId: ownerId,
    };
    const [passwordHash, accessToken] = await Promise.all([
      this.passwords.hash(input.password),
      this.accessTokens.issue(session),
    ]);
    const email = normalizeEmail(input.email);
    const result = await this.registrations.create({
      organizationId,
      organizationName: normalizeName(input.organizationName),
      ownerId,
      ownerName: normalizeName(input.ownerName),
      email,
      normalizedEmail: email,
      passwordHash,
      timezone: defaultOrganizationTimezone,
      termsVersion: input.termsVersion,
      privacyVersion: currentLegalVersion,
      acceptedAt: now,
      sessionId: refreshToken.sessionId,
      familyId: randomUUID(),
      refreshTokenHash: refreshToken.tokenHash,
      sessionExpiresAt: new Date(
        now.getTime() + this.refreshTokenTtlMilliseconds,
      ),
      requestId: input.requestId,
    });

    if (result.status === 'EMAIL_CONFLICT') {
      throw new PublicRegistrationEmailConflictError();
    }

    return {
      account: result.account,
      accessToken,
      refreshToken: refreshToken.token,
    };
  }
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

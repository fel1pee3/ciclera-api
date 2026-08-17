import type { AuthConfiguration } from './ports/auth-configuration.port';
import type { PasswordHasher } from './ports/password-hasher.port';
import type { PublicRegistrationRepository } from './ports/public-registration.repository';
import type {
  AccessTokenService,
  RefreshTokenService,
} from './ports/token-services.port';
import { PublicRegistrationEmailConflictError } from '../domain/public-registration.errors';
import {
  currentLegalVersion,
  defaultOrganizationTimezone,
  PublicRegistrationService,
} from './public-registration.service';

describe('PublicRegistrationService', () => {
  const account = {
    user: {
      id: '10000000-0000-4000-8000-000000000101',
      name: 'Maria Owner',
      email: 'maria@example.test',
      role: 'OWNER' as const,
    },
    organization: {
      id: '10000000-0000-4000-8000-000000000001',
      name: 'Empresa Tecnica',
      timezone: 'America/Sao_Paulo',
    },
  };
  const registrations: jest.Mocked<PublicRegistrationRepository> = {
    create: jest.fn(),
  };
  const passwords: jest.Mocked<PasswordHasher> = {
    hash: jest.fn(),
    verify: jest.fn(),
    performDummyVerification: jest.fn(),
  };
  const accessTokens: jest.Mocked<AccessTokenService> = {
    issue: jest.fn(),
    verify: jest.fn(),
  };
  const refreshTokens: jest.Mocked<RefreshTokenService> = {
    create: jest.fn(),
    parse: jest.fn(),
    hashesMatch: jest.fn(),
  };
  const configuration: AuthConfiguration = {
    refreshTokenTtlSeconds: 2_592_000,
    passwordResetTokenTtlSeconds: 1_800,
    webUrl: 'http://localhost:3000',
  };
  const service = new PublicRegistrationService(
    registrations,
    passwords,
    accessTokens,
    refreshTokens,
    configuration,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    passwords.hash.mockResolvedValue('argon2-hash');
    accessTokens.issue.mockResolvedValue('access-token');
    refreshTokens.create.mockReturnValue({
      sessionId: '10000000-0000-4000-8000-000000000201',
      token: 'refresh-token',
      tokenHash: 'a'.repeat(64),
    });
    registrations.create.mockResolvedValue({ status: 'CREATED', account });
  });

  it('normalizes public fields and persists only prepared credentials', async () => {
    await expect(
      service.register({
        organizationName: '  Empresa   Tecnica ',
        ownerName: ' Maria   Owner ',
        email: '  MARIA@EXAMPLE.TEST ',
        password: 'LocalOnly!2026',
        termsVersion: currentLegalVersion,
        requestId: 'req_registration_unit',
      }),
    ).resolves.toEqual({
      account,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(registrations.create.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        organizationName: 'Empresa Tecnica',
        ownerName: 'Maria Owner',
        email: 'maria@example.test',
        normalizedEmail: 'maria@example.test',
        passwordHash: 'argon2-hash',
        timezone: defaultOrganizationTimezone,
        termsVersion: currentLegalVersion,
        privacyVersion: currentLegalVersion,
      }),
    );
    expect(JSON.stringify(registrations.create.mock.calls)).not.toContain(
      'LocalOnly!2026',
    );
  });

  it('maps a normalized e-mail collision to the stable domain error', async () => {
    registrations.create.mockResolvedValue({ status: 'EMAIL_CONFLICT' });

    await expect(
      service.register({
        organizationName: 'Empresa Tecnica',
        ownerName: 'Maria Owner',
        email: 'maria@example.test',
        password: 'LocalOnly!2026',
        termsVersion: currentLegalVersion,
        requestId: 'req_registration_conflict',
      }),
    ).rejects.toBeInstanceOf(PublicRegistrationEmailConflictError);
  });
});

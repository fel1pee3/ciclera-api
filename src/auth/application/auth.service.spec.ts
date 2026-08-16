import { AuthenticationRejectedError } from '../domain/authentication-rejected.error';
import { AuthService } from './auth.service';
import type {
  IdentityRepository,
  LoginIdentity,
} from './ports/identity.repository';
import type { PasswordHasher } from './ports/password-hasher.port';
import type { SessionRepository } from './ports/session.repository';
import type {
  AccessTokenService,
  RefreshTokenService,
} from './ports/token-services.port';

const activeIdentity: LoginIdentity = {
  user: {
    id: '30000000-0000-4000-8000-000000000101',
    name: 'Test user',
    email: 'Test.User@Example.test',
    role: 'OWNER',
  },
  organization: {
    id: '30000000-0000-4000-8000-000000000010',
    name: 'Test organization',
    timezone: 'America/Sao_Paulo',
  },
  normalizedEmail: 'test.user@example.test',
  passwordHash: '$argon2id$test-only-hash',
  userStatus: 'ACTIVE',
  organizationStatus: 'ACTIVE',
};

describe('AuthService login', () => {
  let identities: jest.Mocked<IdentityRepository>;
  let passwords: jest.Mocked<PasswordHasher>;
  let sessions: jest.Mocked<SessionRepository>;
  let accessTokens: jest.Mocked<AccessTokenService>;
  let refreshTokens: jest.Mocked<RefreshTokenService>;
  let service: AuthService;

  beforeEach(() => {
    identities = {
      findByNormalizedEmail: jest.fn(),
      findAccount: jest.fn(),
    };
    passwords = {
      hash: jest.fn(),
      verify: jest.fn(),
      performDummyVerification: jest.fn(),
    };
    sessions = {
      create: jest.fn(),
      rotate: jest.fn(),
      revokeCurrent: jest.fn(),
      revokeAll: jest.fn(),
      findActive: jest.fn(),
    };
    accessTokens = {
      issue: jest.fn(),
      verify: jest.fn(),
    };
    refreshTokens = {
      create: jest.fn(),
      parse: jest.fn(),
      hashesMatch: jest.fn(),
    };
    service = new AuthService(
      identities,
      passwords,
      sessions,
      accessTokens,
      refreshTokens,
      {
        refreshTokenTtlSeconds: 2_592_000,
        passwordResetTokenTtlSeconds: 1_800,
        webUrl: 'http://localhost:3000',
      },
    );
  });

  it('normalizes the e-mail and performs dummy Argon2 work for an unknown identity', async () => {
    identities.findByNormalizedEmail.mockResolvedValue(null);

    await expect(
      service.login('  Test.User@Example.test  ', 'unknown-password'),
    ).rejects.toBeInstanceOf(AuthenticationRejectedError);
    expect(identities.findByNormalizedEmail.mock.calls).toEqual([
      ['test.user@example.test'],
    ]);
    expect(passwords.performDummyVerification.mock.calls).toEqual([
      ['unknown-password'],
    ]);
    expect(sessions.create.mock.calls).toHaveLength(0);
  });

  it.each([
    ['wrong password', activeIdentity, false],
    [
      'inactive user',
      { ...activeIdentity, userStatus: 'INACTIVE' as const },
      true,
    ],
    [
      'inactive organization',
      { ...activeIdentity, organizationStatus: 'INACTIVE' as const },
      true,
    ],
  ])(
    'uses the same rejection for %s',
    async (_case, identity, passwordMatches) => {
      identities.findByNormalizedEmail.mockResolvedValue(identity);
      passwords.verify.mockResolvedValue(passwordMatches);

      await expect(
        service.login(identity.normalizedEmail, 'submitted-password'),
      ).rejects.toBeInstanceOf(AuthenticationRejectedError);
      expect(sessions.create.mock.calls).toHaveLength(0);
    },
  );
});

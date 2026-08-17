import {
  EnvironmentVariables,
  getRuntimeDatabaseUrl,
  validateEnvironment,
} from './environment';

const validEnvironment = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:password@localhost:55432/ciclera',
  TEST_DATABASE_URL:
    'postgresql://user:password@localhost:55432/ciclera?schema=ciclera_test_unit',
  WEB_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
  JWT_ACCESS_SECRET: 'test-only-access-secret-with-at-least-32-characters',
  JWT_ACCESS_ISSUER: 'ciclera-api-test',
  JWT_ACCESS_AUDIENCE: 'ciclera-web-test',
  ACCESS_TOKEN_TTL: '900',
  REFRESH_TOKEN_TTL: '2592000',
};

describe('validateEnvironment', () => {
  it('applies safe local defaults and returns typed values', () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment.PORT).toBe(3333);
    expect(environment.HTTP_BODY_LIMIT).toBe('100kb');
    expect(environment.CORS_ORIGINS).toEqual([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
    expect(environment.ACCESS_TOKEN_TTL).toBe(900);
    expect(environment.REFRESH_TOKEN_TTL).toBe(2_592_000);
    expect(environment.PASSWORD_RESET_TOKEN_TTL).toBe(1_800);
    expect(environment.PASSWORD_RESET_DELIVERY_MODE).toBe('local');
    expect(environment.PUBLIC_REGISTRATION_ENABLED).toBe(false);
    expect(environment.EVIDENCE_STORAGE_DRIVER).toBe('local');
    expect(environment.RATE_LIMIT_STORAGE_DRIVER).toBe('memory');
  });

  it('only enables public registration through an explicit typed flag', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        PUBLIC_REGISTRATION_ENABLED: 'true',
      }).PUBLIC_REGISTRATION_ENABLED,
    ).toBe(true);
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        PUBLIC_REGISTRATION_ENABLED: 'yes',
      }),
    ).toThrow(/PUBLIC_REGISTRATION_ENABLED/);
  });

  it('prevents bootstrap when required configuration is missing', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      /Invalid environment configuration: DATABASE_URL/,
    );
  });

  it('rejects weak access-token secrets and unsafe token lifetimes', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_ACCESS_SECRET: 'too-short',
        ACCESS_TOKEN_TTL: '7200',
      }),
    ).toThrow(/JWT_ACCESS_SECRET.*ACCESS_TOKEN_TTL/);
  });

  it('forbids local password-reset delivery in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        PASSWORD_RESET_DELIVERY_MODE: 'local',
      }),
    ).toThrow(/PASSWORD_RESET_DELIVERY_MODE/);
  });

  it('fails closed when production-only storage and rate limiting are absent', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        PASSWORD_RESET_DELIVERY_MODE: 'disabled',
      }),
    ).toThrow(/EVIDENCE_STORAGE_DRIVER.*RATE_LIMIT_STORAGE_DRIVER/);
  });

  it('does not include an invalid secret value in the failure message', () => {
    const secretValue = 'not-a-url-with-a-secret-password';

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        DATABASE_URL: secretValue,
      }),
    ).toThrow('DATABASE_URL: must be a valid PostgreSQL URL');

    try {
      validateEnvironment({
        ...validEnvironment,
        DATABASE_URL: secretValue,
      });
    } catch (error) {
      expect((error as Error).message).not.toContain(secretValue);
    }
  });

  it('rejects CORS entries that are not origins', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        CORS_ORIGINS: 'http://localhost:3000/private',
      }),
    ).toThrow(/CORS_ORIGINS/);
  });

  it('never falls back to the development database during tests', () => {
    const environment: EnvironmentVariables = {
      ...validateEnvironment(validEnvironment),
      NODE_ENV: 'test',
      TEST_DATABASE_URL: undefined,
    };

    expect(() => getRuntimeDatabaseUrl(environment)).toThrow(
      'TEST_DATABASE_URL is required in test.',
    );
  });

  it('rejects tests that target the manual-data schema', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'test',
        TEST_DATABASE_URL:
          'postgresql://user:password@localhost:55432/ciclera?schema=public',
      }),
    ).toThrow(/isolated test schema/);
  });
});

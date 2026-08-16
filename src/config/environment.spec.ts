import {
  EnvironmentVariables,
  getRuntimeDatabaseUrl,
  validateEnvironment,
} from './environment';

const validEnvironment = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:password@localhost:55432/ciclera_dev',
  TEST_DATABASE_URL: 'postgresql://user:password@localhost:55432/ciclera_test',
  WEB_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
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
  });

  it('prevents bootstrap when required configuration is missing', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      /Invalid environment configuration: DATABASE_URL/,
    );
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
});

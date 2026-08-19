import { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { CookieCsrfGuard } from './cookie-csrf.guard';

const environment = {
  NODE_ENV: 'test',
  PORT: 3333,
  DATABASE_URL: 'postgresql://local:local@localhost:55432/ciclera',
  TEST_DATABASE_URL:
    'postgresql://local:local@localhost:55432/ciclera?schema=ciclera_test_unit',
  WEB_URL: 'http://localhost:3000',
  CORS_ORIGINS: ['http://localhost:3000'],
  HTTP_BODY_LIMIT: '100kb',
  LOG_LEVEL: 'error',
  TRUST_PROXY_HOPS: 0,
  JWT_ACCESS_SECRET: 'test-only-access-secret-with-at-least-32-characters',
  JWT_ACCESS_ISSUER: 'ciclera-api-test',
  JWT_ACCESS_AUDIENCE: 'ciclera-web-test',
  ACCESS_TOKEN_TTL: 900,
  REFRESH_TOKEN_TTL: 2_592_000,
  PASSWORD_RESET_TOKEN_TTL: 1_800,
  PASSWORD_RESET_DELIVERY_MODE: 'local',
  PUBLIC_REGISTRATION_ENABLED: false,
  AUTH_COOKIE_SAME_SITE: 'strict',
  EVIDENCE_STORAGE_DRIVER: 'local',
  EVIDENCE_STORAGE_ROOT: '.local/evidence',
  UPLOAD_MAX_FILE_SIZE_BYTES: 10_485_760,
  UPLOAD_ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  UPLOAD_MAX_FILES_PER_EXECUTION: 20,
  EVIDENCE_URL_TTL: 300,
  RATE_LIMIT_STORAGE_DRIVER: 'memory',
} as const;

describe('CookieCsrfGuard', () => {
  const guard = new CookieCsrfGuard(
    new ConfigService<Record<string, unknown>>(environment),
  );

  it('allows safe methods and non-cookie public mutations', () => {
    expect(guard.canActivate(context('GET'))).toBe(true);
    expect(guard.canActivate(context('POST'))).toBe(true);
  });

  it('requires an allowlisted Origin for cookie-authenticated mutations', () => {
    const cookie = 'ciclera_access=private-value';
    expect(() => guard.canActivate(context('PATCH', cookie))).toThrow(
      'Forbidden',
    );
    expect(() =>
      guard.canActivate(context('PATCH', cookie, 'https://attacker.test')),
    ).toThrow('Forbidden');
    expect(
      guard.canActivate(context('PATCH', cookie, 'http://localhost:3000')),
    ).toBe(true);
  });
});

function context(
  method: string,
  cookie?: string,
  origin?: string,
): ExecutionContext {
  const headers: Record<string, string | undefined> = { cookie, origin };
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        header: (name: string) => headers[name.toLowerCase()],
      }),
    }),
  } as ExecutionContext;
}

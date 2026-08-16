import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { validateEnvironment } from '../../config/environment';
import {
  accessCookieName,
  AuthCookieService,
  refreshCookieName,
} from './auth-cookies';

describe('AuthCookieService', () => {
  it('uses Secure in production and clears cookies with matching security attributes', () => {
    const service = new AuthCookieService(
      new ConfigService(
        validateEnvironment({
          NODE_ENV: 'production',
          DATABASE_URL:
            'postgresql://user:password@localhost:55432/ciclera_dev',
          WEB_URL: 'https://app.ciclera.example',
          CORS_ORIGINS: 'https://app.ciclera.example',
          JWT_ACCESS_SECRET:
            'test-only-access-secret-with-at-least-32-characters',
          JWT_ACCESS_ISSUER: 'ciclera-api-test',
          JWT_ACCESS_AUDIENCE: 'ciclera-web-test',
          ACCESS_TOKEN_TTL: '900',
          REFRESH_TOKEN_TTL: '2592000',
        }),
      ),
    );
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;

    service.write(response, {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
    });
    service.clear(response);

    expect(cookie).toHaveBeenNthCalledWith(
      1,
      accessCookieName,
      'test-access-token',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 900_000,
      }),
    );
    expect(cookie).toHaveBeenNthCalledWith(
      2,
      refreshCookieName,
      'test-refresh-token',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: 2_592_000_000,
      }),
    );
    expect(cookie).toHaveBeenNthCalledWith(
      3,
      accessCookieName,
      '',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 0,
      }),
    );
    expect(cookie).toHaveBeenNthCalledWith(
      4,
      refreshCookieName,
      '',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: 0,
      }),
    );
  });
});

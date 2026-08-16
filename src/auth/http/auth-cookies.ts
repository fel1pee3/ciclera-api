import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';
import { readEnvironment } from '../../config/environment';
import {
  IssuedAuthentication,
  RefreshedAuthentication,
} from '../application/auth.service';

export const accessCookieName = 'ciclera_access';
export const refreshCookieName = 'ciclera_refresh';
const refreshCookiePath = '/api/v1/auth';

@Injectable()
export class AuthCookieService {
  private readonly accessOptions: CookieOptions;
  private readonly refreshOptions: CookieOptions;

  constructor(configService: ConfigService) {
    const environment = readEnvironment(configService);
    const sharedOptions: CookieOptions = {
      httpOnly: true,
      secure: environment.NODE_ENV === 'production',
      sameSite: 'strict',
    };

    this.accessOptions = {
      ...sharedOptions,
      path: '/',
      maxAge: environment.ACCESS_TOKEN_TTL * 1_000,
    };
    this.refreshOptions = {
      ...sharedOptions,
      path: refreshCookiePath,
      maxAge: environment.REFRESH_TOKEN_TTL * 1_000,
    };
  }

  write(
    response: Response,
    authentication: IssuedAuthentication | RefreshedAuthentication,
  ): void {
    response.cookie(
      accessCookieName,
      authentication.accessToken,
      this.accessOptions,
    );
    response.cookie(
      refreshCookieName,
      authentication.refreshToken,
      this.refreshOptions,
    );
  }

  clear(response: Response): void {
    expireCookie(response, accessCookieName, this.accessOptions);
    expireCookie(response, refreshCookieName, this.refreshOptions);
  }
}

export function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');

    if (separatorIndex < 1 || part.slice(0, separatorIndex).trim() !== name) {
      continue;
    }

    const value = part.slice(separatorIndex + 1).trim();

    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function expireCookie(
  response: Response,
  name: string,
  options: CookieOptions,
): void {
  response.cookie(name, '', {
    ...options,
    expires: new Date(0),
    maxAge: 0,
  });
}

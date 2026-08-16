import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { readEnvironment } from '../../config/environment';
import {
  accessCookieName,
  readCookie,
  refreshCookieName,
} from './auth-cookies';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CookieCsrfGuard implements CanActivate {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(configService: ConfigService) {
    this.allowedOrigins = new Set(readEnvironment(configService).CORS_ORIGINS);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (safeMethods.has(request.method.toUpperCase())) return true;

    const cookie = request.header('cookie');
    const usesAuthenticationCookie =
      readCookie(cookie, accessCookieName) !== undefined ||
      readCookie(cookie, refreshCookieName) !== undefined;
    if (!usesAuthenticationCookie) return true;

    const origin = request.header('origin');
    if (!origin || !this.allowedOrigins.has(origin)) {
      throw new ForbiddenException({
        type: 'https://ciclera.com.br/problems/origin-not-allowed',
        title: 'Origem não permitida',
        detail: 'A origem da requisição não é permitida.',
        code: 'ORIGIN_NOT_ALLOWED',
      });
    }

    return true;
  }
}

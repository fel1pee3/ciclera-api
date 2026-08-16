import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { readEnvironment } from '../../config/environment';

@Injectable()
export class AllowedOriginGuard implements CanActivate {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(configService: ConfigService) {
    this.allowedOrigins = new Set(readEnvironment(configService).CORS_ORIGINS);
  }

  canActivate(context: ExecutionContext): boolean {
    const origin = context
      .switchToHttp()
      .getRequest<Request>()
      .header('origin');

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

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PublicRegistrationDisabledError } from '../domain/public-registration.errors';

export const publicRegistrationBodyLimitBytes = 16 * 1024;
export const PUBLIC_REGISTRATION_CONFIGURATION = Symbol(
  'PUBLIC_REGISTRATION_CONFIGURATION',
);

export interface PublicRegistrationConfiguration {
  enabled: boolean;
}

@Injectable()
export class PublicRegistrationEnabledGuard implements CanActivate {
  constructor(
    @Inject(PUBLIC_REGISTRATION_CONFIGURATION)
    private readonly configuration: PublicRegistrationConfiguration,
  ) {}

  canActivate(): true {
    if (!this.configuration.enabled) {
      throw new PublicRegistrationDisabledError();
    }

    return true;
  }
}

@Injectable()
export class PublicRegistrationRequestGuard implements CanActivate {
  canActivate(context: ExecutionContext): true {
    const request = context.switchToHttp().getRequest<Request>();

    if (!request.is('application/json')) {
      throw new UnsupportedMediaTypeException({
        type: 'https://ciclera.com.br/problems/unsupported-media-type',
        title: 'Formato n\u00e3o suportado',
        detail: 'Envie o cadastro como application/json.',
        code: 'UNSUPPORTED_MEDIA_TYPE',
      });
    }

    const contentLength = request.header('content-length');
    const parsedLength = contentLength ? Number(contentLength) : 0;

    if (
      Number.isFinite(parsedLength) &&
      parsedLength > publicRegistrationBodyLimitBytes
    ) {
      throw new PayloadTooLargeException();
    }

    return true;
  }
}

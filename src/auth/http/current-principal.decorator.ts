import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedPrincipal } from '../domain/authenticated-principal';
import {
  AuthenticatedRequest,
  getAuthenticatedPrincipal,
} from './authenticated-request';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal =>
    getAuthenticatedPrincipal(
      context.switchToHttp().getRequest<AuthenticatedRequest>(),
    ),
);

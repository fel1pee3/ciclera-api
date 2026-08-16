import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedPrincipal } from '../domain/authenticated-principal';

const authenticatedPrincipalKey = Symbol('authenticatedPrincipal');

export interface AuthenticatedRequest extends Request {
  [authenticatedPrincipalKey]?: AuthenticatedPrincipal;
}

export function setAuthenticatedPrincipal(
  request: AuthenticatedRequest,
  principal: AuthenticatedPrincipal,
): void {
  request[authenticatedPrincipalKey] = principal;
}

export function getAuthenticatedPrincipal(
  request: AuthenticatedRequest,
): AuthenticatedPrincipal {
  const principal = request[authenticatedPrincipalKey];

  if (!principal) {
    throw new UnauthorizedException();
  }

  return principal;
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../domain/authenticated-principal';
import {
  AuthenticatedRequest,
  getAuthenticatedPrincipal,
} from './authenticated-request';
import { requiredRolesMetadataKey } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      readonly UserRole[] | undefined
    >(requiredRolesMetadataKey, [context.getHandler(), context.getClass()]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const principal = getAuthenticatedPrincipal(
      context.switchToHttp().getRequest<AuthenticatedRequest>(),
    );

    if (!requiredRoles.includes(principal.role)) {
      throw new ForbiddenException();
    }

    return true;
  }
}

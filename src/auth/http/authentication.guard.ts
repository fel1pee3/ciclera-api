import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_USER_REPOSITORY } from '../application/ports/authenticated-user.repository';
import type { AuthenticatedUserRepository } from '../application/ports/authenticated-user.repository';
import { SESSION_RESOLVER } from '../application/ports/session-resolver.port';
import type { SessionResolver } from '../application/ports/session-resolver.port';
import {
  AuthenticatedRequest,
  setAuthenticatedPrincipal,
} from './authenticated-request';
import { publicRouteMetadataKey } from './public.decorator';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(SESSION_RESOLVER)
    private readonly sessionResolver: SessionResolver,
    @Inject(AUTHENTICATED_USER_REPOSITORY)
    private readonly userRepository: AuthenticatedUserRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      publicRouteMetadataKey,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.sessionResolver.resolveSession({
      authorization: request.header('authorization'),
      cookie: request.header('cookie'),
    });

    if (!session) {
      throw new UnauthorizedException();
    }

    const user = await this.userRepository.findById({
      organizationId: session.organizationId,
      userId: session.userId,
    });

    if (
      !user ||
      user.organizationId !== session.organizationId ||
      user.status !== 'ACTIVE' ||
      user.organizationStatus !== 'ACTIVE'
    ) {
      throw new UnauthorizedException();
    }

    setAuthenticatedPrincipal(request, {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      sessionId: session.sessionId,
    });

    return true;
  }
}

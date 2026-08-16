import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AUTHENTICATED_USER_REPOSITORY } from './application/ports/authenticated-user.repository';
import { SESSION_RESOLVER } from './application/ports/session-resolver.port';
import { AuthenticationGuard } from './http/authentication.guard';
import { RolesGuard } from './http/roles.guard';
import { PrismaAuthenticatedUserRepository } from './infrastructure/prisma-authenticated-user.repository';
import { UnavailableSessionResolver } from './infrastructure/unavailable-session-resolver';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [
    AuthenticationGuard,
    RolesGuard,
    {
      provide: APP_GUARD,
      useExisting: AuthenticationGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: RolesGuard,
    },
    {
      provide: SESSION_RESOLVER,
      useClass: UnavailableSessionResolver,
    },
    {
      provide: AUTHENTICATED_USER_REPOSITORY,
      useClass: PrismaAuthenticatedUserRepository,
    },
  ],
  exports: [
    AuthenticationGuard,
    RolesGuard,
    SESSION_RESOLVER,
    AUTHENTICATED_USER_REPOSITORY,
  ],
})
export class AuthModule {}

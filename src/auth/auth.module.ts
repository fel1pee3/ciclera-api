import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './application/auth.service';
import { AUTH_CONFIGURATION } from './application/ports/auth-configuration.port';
import { AUTHENTICATED_USER_REPOSITORY } from './application/ports/authenticated-user.repository';
import { IDENTITY_REPOSITORY } from './application/ports/identity.repository';
import { PASSWORD_HASHER } from './application/ports/password-hasher.port';
import { SESSION_REPOSITORY } from './application/ports/session.repository';
import { SESSION_RESOLVER } from './application/ports/session-resolver.port';
import {
  ACCESS_TOKEN_SERVICE,
  REFRESH_TOKEN_SERVICE,
} from './application/ports/token-services.port';
import { AllowedOriginGuard } from './http/allowed-origin.guard';
import { AuthController } from './http/auth.controller';
import { AuthCookieService } from './http/auth-cookies';
import { AuthenticationGuard } from './http/authentication.guard';
import { RolesGuard } from './http/roles.guard';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { DatabaseSessionResolver } from './infrastructure/database-session-resolver';
import { JwtAccessTokenService } from './infrastructure/jwt-access-token.service';
import { PrismaAuthenticatedUserRepository } from './infrastructure/prisma-authenticated-user.repository';
import { PrismaIdentityRepository } from './infrastructure/prisma-identity.repository';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository';
import { CryptoRefreshTokenService } from './infrastructure/refresh-token.service';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { readEnvironment } from '../config/environment';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookieService,
    AllowedOriginGuard,
    {
      provide: AUTH_CONFIGURATION,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        refreshTokenTtlSeconds:
          readEnvironment(configService).REFRESH_TOKEN_TTL,
      }),
    },
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
      useClass: DatabaseSessionResolver,
    },
    {
      provide: AUTHENTICATED_USER_REPOSITORY,
      useClass: PrismaAuthenticatedUserRepository,
    },
    {
      provide: IDENTITY_REPOSITORY,
      useClass: PrismaIdentityRepository,
    },
    {
      provide: PASSWORD_HASHER,
      useClass: Argon2PasswordHasher,
    },
    {
      provide: SESSION_REPOSITORY,
      useClass: PrismaSessionRepository,
    },
    {
      provide: ACCESS_TOKEN_SERVICE,
      useClass: JwtAccessTokenService,
    },
    {
      provide: REFRESH_TOKEN_SERVICE,
      useClass: CryptoRefreshTokenService,
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

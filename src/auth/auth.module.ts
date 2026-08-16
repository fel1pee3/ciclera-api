import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './application/auth.service';
import { PasswordResetService } from './application/password-reset.service';
import { AUTH_CONFIGURATION } from './application/ports/auth-configuration.port';
import { AUTHENTICATED_USER_REPOSITORY } from './application/ports/authenticated-user.repository';
import { IDENTITY_REPOSITORY } from './application/ports/identity.repository';
import { EMAIL_GATEWAY } from './application/ports/email-gateway.port';
import { PASSWORD_HASHER } from './application/ports/password-hasher.port';
import { PASSWORD_RESET_DELIVERY_OBSERVER } from './application/ports/password-reset-delivery-observer.port';
import { PASSWORD_RESET_REPOSITORY } from './application/ports/password-reset.repository';
import { PASSWORD_RESET_TOKEN_SERVICE } from './application/ports/password-reset-token.port';
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
import { PrismaPasswordResetRepository } from './infrastructure/prisma-password-reset.repository';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository';
import { CryptoRefreshTokenService } from './infrastructure/refresh-token.service';
import { CryptoPasswordResetTokenService } from './infrastructure/password-reset-token.service';
import { StructuredPasswordResetDeliveryObserver } from './infrastructure/password-reset-delivery-observer';
import {
  DisabledPasswordResetEmailGateway,
  LocalPasswordResetEmailGateway,
} from './infrastructure/password-reset-email.gateway';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { readEnvironment } from '../config/environment';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetService,
    AuthCookieService,
    AllowedOriginGuard,
    {
      provide: AUTH_CONFIGURATION,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        refreshTokenTtlSeconds:
          readEnvironment(configService).REFRESH_TOKEN_TTL,
        passwordResetTokenTtlSeconds:
          readEnvironment(configService).PASSWORD_RESET_TOKEN_TTL,
        webUrl: readEnvironment(configService).WEB_URL,
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
      provide: PASSWORD_RESET_REPOSITORY,
      useClass: PrismaPasswordResetRepository,
    },
    {
      provide: PASSWORD_RESET_TOKEN_SERVICE,
      useClass: CryptoPasswordResetTokenService,
    },
    {
      provide: PASSWORD_RESET_DELIVERY_OBSERVER,
      useClass: StructuredPasswordResetDeliveryObserver,
    },
    {
      provide: EMAIL_GATEWAY,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const environment = readEnvironment(configService);
        return environment.PASSWORD_RESET_DELIVERY_MODE === 'local'
          ? new LocalPasswordResetEmailGateway(configService)
          : new DisabledPasswordResetEmailGateway();
      },
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

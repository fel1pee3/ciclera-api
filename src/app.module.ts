import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { authIdentifierTracker } from './auth/http/auth-rate-limit';
import { validateEnvironment } from './config/environment';
import { CustomersModule } from './customers/customers.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './infrastructure/database/prisma/prisma.module';
import { StructuredLoggerService } from './observability/structured-logger.service';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      { name: 'ip', limit: 100, ttl: 60_000 },
      {
        name: 'identifier',
        limit: 100,
        ttl: 60_000,
        getTracker: authIdentifierTracker,
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    HealthModule,
  ],
  providers: [StructuredLoggerService],
})
export class AppModule {}

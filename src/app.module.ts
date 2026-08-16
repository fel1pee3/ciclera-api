import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './infrastructure/database/prisma/prisma.module';
import { StructuredLoggerService } from './observability/structured-logger.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
  ],
  providers: [StructuredLoggerService],
})
export class AppModule {}

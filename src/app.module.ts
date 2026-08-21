import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { AdditionalItemsModule } from './additional-items/additional-items.module';
import { authIdentifierTracker } from './auth/http/auth-rate-limit';
import { validateEnvironment } from './config/environment';
import { CustomersModule } from './customers/customers.module';
import { EquipmentModule } from './equipment/equipment.module';
import { EvidenceModule } from './evidence/evidence.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './infrastructure/database/prisma/prisma.module';
import { StructuredLoggerService } from './observability/structured-logger.service';
import { UsersModule } from './users/users.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { ReviewsModule } from './reviews/reviews.module';
import { BillingModule } from './billing/billing.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HistoryModule } from './history/history.module';
import { ReportsModule } from './reports/reports.module';
import { ImportsModule } from './imports/imports.module';
import { UpstashThrottlerStorage } from './infrastructure/rate-limit/upstash-throttler-storage';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage:
          config.getOrThrow<'memory' | 'upstash'>(
            'RATE_LIMIT_STORAGE_DRIVER',
          ) === 'upstash'
            ? new UpstashThrottlerStorage(config)
            : undefined,
        throttlers: [
          { name: 'ip', limit: 100, ttl: 60_000 },
          {
            name: 'identifier',
            limit: 100,
            ttl: 60_000,
            getTracker: authIdentifierTracker,
          },
        ],
      }),
    }),
    PrismaModule,
    AdditionalItemsModule,
    AuthModule,
    SubscriptionsModule,
    UsersModule,
    CustomersModule,
    EquipmentModule,
    WorkOrdersModule,
    EvidenceModule,
    ReviewsModule,
    BillingModule,
    DashboardModule,
    HistoryModule,
    ReportsModule,
    ImportsModule,
    HealthModule,
  ],
  providers: [StructuredLoggerService],
})
export class AppModule {}

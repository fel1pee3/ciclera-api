import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { AdditionalItemsModule } from './additional-items/additional-items.module';
import { authIdentifierTracker } from './auth/http/auth-rate-limit';
import { validateEnvironment } from './config/environment';
import { CustomersModule } from './customers/customers.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { EquipmentModule } from './equipment/equipment.module';
import { EvidenceModule } from './evidence/evidence.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './infrastructure/database/prisma/prisma.module';
import { StructuredLoggerService } from './observability/structured-logger.service';
import { UsersModule } from './users/users.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { ReviewsModule } from './reviews/reviews.module';
import { BillingModule } from './billing/billing.module';

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
    AdditionalItemsModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    ChecklistsModule,
    EquipmentModule,
    WorkOrdersModule,
    EvidenceModule,
    ReviewsModule,
    BillingModule,
    HealthModule,
  ],
  providers: [StructuredLoggerService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { BillingService } from './application/billing.service';
import { BILLING_REPOSITORY } from './application/ports/billing.repository';
import { BillingController } from './http/billing.controller';
import { PrismaBillingRepository } from './infrastructure/prisma-billing.repository';

@Module({
  imports: [PrismaModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    { provide: BILLING_REPOSITORY, useClass: PrismaBillingRepository },
  ],
  exports: [BillingService],
})
export class BillingModule {}

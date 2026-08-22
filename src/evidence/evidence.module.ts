import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { EvidenceStorageModule } from './evidence-storage.module';
import { EvidenceService } from './application/evidence.service';
import { EVIDENCE_REPOSITORY } from './application/ports/evidence.repository';
import { EvidenceController } from './http/evidence.controller';
import { ReviewEvidenceController } from './http/review-evidence.controller';
import { EvidenceTokenService } from './infrastructure/evidence-token.service';
import { PrismaEvidenceRepository } from './infrastructure/prisma-evidence.repository';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    WorkOrdersModule,
    SubscriptionsModule,
    EvidenceStorageModule,
  ],
  controllers: [EvidenceController, ReviewEvidenceController],
  providers: [
    EvidenceService,
    EvidenceTokenService,
    { provide: EVIDENCE_REPOSITORY, useClass: PrismaEvidenceRepository },
  ],
})
export class EvidenceModule {}

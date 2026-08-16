import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { EvidenceService } from './application/evidence.service';
import { EVIDENCE_REPOSITORY } from './application/ports/evidence.repository';
import { EVIDENCE_STORAGE } from './application/ports/evidence-storage.port';
import { EvidenceController } from './http/evidence.controller';
import { EvidenceTokenService } from './infrastructure/evidence-token.service';
import { LocalEvidenceStorage } from './infrastructure/local-evidence-storage';
import { PrismaEvidenceRepository } from './infrastructure/prisma-evidence.repository';

@Module({
  imports: [AuthModule, PrismaModule, WorkOrdersModule],
  controllers: [EvidenceController],
  providers: [
    EvidenceService,
    EvidenceTokenService,
    { provide: EVIDENCE_REPOSITORY, useClass: PrismaEvidenceRepository },
    { provide: EVIDENCE_STORAGE, useClass: LocalEvidenceStorage },
  ],
})
export class EvidenceModule {}

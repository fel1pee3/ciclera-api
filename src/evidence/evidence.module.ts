import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { EvidenceService } from './application/evidence.service';
import { EVIDENCE_REPOSITORY } from './application/ports/evidence.repository';
import { EVIDENCE_STORAGE } from './application/ports/evidence-storage.port';
import { EvidenceController } from './http/evidence.controller';
import { ReviewEvidenceController } from './http/review-evidence.controller';
import { EvidenceTokenService } from './infrastructure/evidence-token.service';
import { LocalEvidenceStorage } from './infrastructure/local-evidence-storage';
import { PrismaEvidenceRepository } from './infrastructure/prisma-evidence.repository';
import { SupabaseEvidenceStorage } from './infrastructure/supabase-evidence-storage';

@Module({
  imports: [AuthModule, PrismaModule, WorkOrdersModule],
  controllers: [EvidenceController, ReviewEvidenceController],
  providers: [
    EvidenceService,
    EvidenceTokenService,
    { provide: EVIDENCE_REPOSITORY, useClass: PrismaEvidenceRepository },
    {
      provide: EVIDENCE_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.getOrThrow<'local' | 'supabase'>('EVIDENCE_STORAGE_DRIVER') ===
        'supabase'
          ? new SupabaseEvidenceStorage(config)
          : new LocalEvidenceStorage(config),
    },
  ],
})
export class EvidenceModule {}

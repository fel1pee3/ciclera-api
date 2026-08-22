import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EVIDENCE_STORAGE,
  type EvidenceStorage,
} from './application/ports/evidence-storage.port';
import { LocalEvidenceStorage } from './infrastructure/local-evidence-storage';
import { SupabaseEvidenceStorage } from './infrastructure/supabase-evidence-storage';

export function createEvidenceStorage(config: ConfigService): EvidenceStorage {
  return config.getOrThrow<'local' | 'supabase'>('EVIDENCE_STORAGE_DRIVER') ===
    'supabase'
    ? new SupabaseEvidenceStorage(config)
    : new LocalEvidenceStorage(config);
}

@Module({
  providers: [
    {
      provide: EVIDENCE_STORAGE,
      inject: [ConfigService],
      useFactory: createEvidenceStorage,
    },
  ],
  exports: [EVIDENCE_STORAGE],
})
export class EvidenceStorageModule {}

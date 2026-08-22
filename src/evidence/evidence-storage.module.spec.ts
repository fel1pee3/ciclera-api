import { ConfigService } from '@nestjs/config';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ReportsModule } from '../reports/reports.module';
import {
  createEvidenceStorage,
  EvidenceStorageModule,
} from './evidence-storage.module';
import { LocalEvidenceStorage } from './infrastructure/local-evidence-storage';
import { SupabaseEvidenceStorage } from './infrastructure/supabase-evidence-storage';

describe('EvidenceStorageModule', () => {
  it('uses local storage only when the configured driver is local', () => {
    const storage = createEvidenceStorage(
      new ConfigService({
        EVIDENCE_STORAGE_DRIVER: 'local',
        EVIDENCE_STORAGE_ROOT: '.local/evidence',
      }),
    );

    expect(storage).toBeInstanceOf(LocalEvidenceStorage);
  });

  it('uses Supabase storage when the configured driver is supabase', () => {
    const storage = createEvidenceStorage(
      new ConfigService({
        EVIDENCE_STORAGE_DRIVER: 'supabase',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SECRET_KEY: 'secret-key-with-at-least-twenty-characters',
        SUPABASE_STORAGE_BUCKET: 'evidence',
      }),
    );

    expect(storage).toBeInstanceOf(SupabaseEvidenceStorage);
  });

  it('shares the configured evidence storage with report generation', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ReportsModule,
    ) as unknown[];

    expect(imports).toContain(EvidenceStorageModule);
  });
});

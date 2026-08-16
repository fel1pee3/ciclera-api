import { Module } from '@nestjs/common';
import { EVIDENCE_STORAGE } from '../evidence/application/ports/evidence-storage.port';
import { LocalEvidenceStorage } from '../evidence/infrastructure/local-evidence-storage';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { REPORT_REPOSITORY } from './application/ports/report.repository';
import { ServiceReportService } from './application/service-report.service';
import { ReportsController } from './http/reports.controller';
import { PrismaReportRepository } from './infrastructure/prisma-report.repository';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [
    ServiceReportService,
    { provide: REPORT_REPOSITORY, useClass: PrismaReportRepository },
    { provide: EVIDENCE_STORAGE, useClass: LocalEvidenceStorage },
  ],
})
export class ReportsModule {}

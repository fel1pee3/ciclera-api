import { Module } from '@nestjs/common';
import { EvidenceStorageModule } from '../evidence/evidence-storage.module';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { REPORT_REPOSITORY } from './application/ports/report.repository';
import { ServiceReportService } from './application/service-report.service';
import { ReportsController } from './http/reports.controller';
import { PrismaReportRepository } from './infrastructure/prisma-report.repository';

@Module({
  imports: [PrismaModule, EvidenceStorageModule],
  controllers: [ReportsController],
  providers: [
    ServiceReportService,
    { provide: REPORT_REPOSITORY, useClass: PrismaReportRepository },
  ],
})
export class ReportsModule {}

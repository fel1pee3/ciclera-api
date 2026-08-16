import { Module } from '@nestjs/common';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { InitialDataImportService } from './application/initial-data-import.service';
import { INITIAL_DATA_IMPORT_REPOSITORY } from './application/ports/initial-data-import.repository';
import { InitialDataImportController } from './http/initial-data-import.controller';
import { PrismaInitialDataImportRepository } from './infrastructure/prisma-initial-data-import.repository';

@Module({
  imports: [PrismaModule],
  controllers: [InitialDataImportController],
  providers: [
    InitialDataImportService,
    {
      provide: INITIAL_DATA_IMPORT_REPOSITORY,
      useClass: PrismaInitialDataImportRepository,
    },
  ],
  exports: [InitialDataImportService],
})
export class ImportsModule {}

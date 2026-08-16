import { Module } from '@nestjs/common';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { HistoryService } from './application/history.service';
import { HISTORY_REPOSITORY } from './application/ports/history.repository';
import { HistoryController } from './http/history.controller';
import { PrismaHistoryRepository } from './infrastructure/prisma-history.repository';

@Module({
  imports: [PrismaModule],
  controllers: [HistoryController],
  providers: [
    HistoryService,
    { provide: HISTORY_REPOSITORY, useClass: PrismaHistoryRepository },
  ],
  exports: [HistoryService],
})
export class HistoryModule {}

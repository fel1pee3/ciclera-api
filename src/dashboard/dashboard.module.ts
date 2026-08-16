import { Module } from '@nestjs/common';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { DashboardService } from './application/dashboard.service';
import { DASHBOARD_REPOSITORY } from './application/ports/dashboard.repository';
import { DashboardController } from './http/dashboard.controller';
import { PrismaDashboardRepository } from './infrastructure/prisma-dashboard.repository';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    { provide: DASHBOARD_REPOSITORY, useClass: PrismaDashboardRepository },
  ],
  exports: [DashboardService],
})
export class DashboardModule {}

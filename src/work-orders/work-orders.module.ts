import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { WORK_ORDER_REPOSITORY } from './application/ports/work-order.repository';
import { WorkOrdersService } from './application/work-orders.service';
import { WorkOrdersController } from './http/work-orders.controller';
import { PrismaWorkOrderRepository } from './infrastructure/prisma-work-order.repository';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [WorkOrdersController],
  providers: [
    WorkOrdersService,
    { provide: WORK_ORDER_REPOSITORY, useClass: PrismaWorkOrderRepository },
  ],
  exports: [WorkOrdersService, WORK_ORDER_REPOSITORY],
})
export class WorkOrdersModule {}

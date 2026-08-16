import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { WORK_ORDER_REPOSITORY } from './application/ports/work-order.repository';
import { TECHNICIAN_WORK_ORDER_REPOSITORY } from './application/ports/technician-work-order.repository';
import { TechnicianWorkOrdersService } from './application/technician-work-orders.service';
import { WorkOrdersService } from './application/work-orders.service';
import { WorkOrdersController } from './http/work-orders.controller';
import { TechnicianWorkOrdersController } from './http/technician-work-orders.controller';
import { PrismaTechnicianWorkOrderRepository } from './infrastructure/prisma-technician-work-order.repository';
import { PrismaWorkOrderRepository } from './infrastructure/prisma-work-order.repository';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [WorkOrdersController, TechnicianWorkOrdersController],
  providers: [
    WorkOrdersService,
    TechnicianWorkOrdersService,
    { provide: WORK_ORDER_REPOSITORY, useClass: PrismaWorkOrderRepository },
    {
      provide: TECHNICIAN_WORK_ORDER_REPOSITORY,
      useClass: PrismaTechnicianWorkOrderRepository,
    },
  ],
  exports: [
    WorkOrdersService,
    TechnicianWorkOrdersService,
    WORK_ORDER_REPOSITORY,
    TECHNICIAN_WORK_ORDER_REPOSITORY,
  ],
})
export class WorkOrdersModule {}

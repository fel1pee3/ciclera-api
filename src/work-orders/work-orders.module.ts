import { Module } from '@nestjs/common';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { WORK_ORDER_REPOSITORY } from './application/ports/work-order.repository';
import { PrismaWorkOrderRepository } from './infrastructure/prisma-work-order.repository';

@Module({
  imports: [PrismaModule],
  providers: [
    { provide: WORK_ORDER_REPOSITORY, useClass: PrismaWorkOrderRepository },
  ],
  exports: [WORK_ORDER_REPOSITORY],
})
export class WorkOrdersModule {}

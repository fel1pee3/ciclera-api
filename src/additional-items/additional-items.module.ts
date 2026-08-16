import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { AdditionalItemsService } from './application/additional-items.service';
import { ADDITIONAL_ITEM_REPOSITORY } from './application/ports/additional-item.repository';
import { AdditionalItemsController } from './http/additional-items.controller';
import { PrismaAdditionalItemRepository } from './infrastructure/prisma-additional-item.repository';

@Module({
  imports: [AuthModule, PrismaModule, WorkOrdersModule],
  controllers: [AdditionalItemsController],
  providers: [
    AdditionalItemsService,
    {
      provide: ADDITIONAL_ITEM_REPOSITORY,
      useClass: PrismaAdditionalItemRepository,
    },
  ],
})
export class AdditionalItemsModule {}

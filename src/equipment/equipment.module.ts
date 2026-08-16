import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { EquipmentService } from './application/equipment.service';
import { EQUIPMENT_REPOSITORY } from './application/ports/equipment.repository';
import { EquipmentController } from './http/equipment.controller';
import { PrismaEquipmentRepository } from './infrastructure/prisma-equipment.repository';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [EquipmentController],
  providers: [
    EquipmentService,
    { provide: EQUIPMENT_REPOSITORY, useClass: PrismaEquipmentRepository },
  ],
  exports: [EquipmentService, EQUIPMENT_REPOSITORY],
})
export class EquipmentModule {}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  technicianWorkOrderViews,
  type TechnicianWorkOrderView,
} from '../application/ports/technician-work-order.repository';
import type { WorkOrderPriority, WorkOrderStatus } from '../domain/work-order';
import { workOrderPriorities, workOrderStatuses } from '../domain/work-order';

export class TechnicianWorkOrderQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @ApiPropertyOptional({ enum: technicianWorkOrderViews })
  @IsOptional()
  @IsIn(technicianWorkOrderViews)
  view?: TechnicianWorkOrderView;
}

export class TechnicianCustomerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}

export class TechnicianLocationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() street!: string;
  @ApiProperty() number!: string;
  @ApiProperty({ nullable: true }) complement!: string | null;
  @ApiProperty() neighborhood!: string;
  @ApiProperty() city!: string;
  @ApiProperty() state!: string;
}

export class TechnicianEquipmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() identifier!: string;
}

export class TechnicianWorkOrderResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'OS-000001' }) number!: string;
  @ApiProperty({ type: TechnicianCustomerDto })
  customer!: TechnicianCustomerDto;
  @ApiProperty({ type: TechnicianLocationDto })
  location!: TechnicianLocationDto;
  @ApiProperty({ type: TechnicianEquipmentDto, nullable: true })
  equipment!: TechnicianEquipmentDto | null;
  @ApiProperty() serviceType!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: workOrderPriorities }) priority!: WorkOrderPriority;
  @ApiProperty({ enum: workOrderStatuses }) status!: WorkOrderStatus;
  @ApiProperty({ format: 'date-time', nullable: true })
  scheduledStartAt!: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true })
  scheduledEndAt!: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true })
  actualStartAt!: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true })
  actualEndAt!: Date | null;
  @ApiProperty() version!: number;
}

export class TechnicianWorkOrderPageDto {
  @ApiProperty({ type: [TechnicianWorkOrderResponseDto] })
  items!: TechnicianWorkOrderResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
  @ApiProperty() timezone!: string;
}

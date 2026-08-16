import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsDefined,
  ValidateNested,
  ArrayMaxSize,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
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
  @ApiProperty({ type: () => WorkOrderExecutionResponseDto, nullable: true })
  execution!: WorkOrderExecutionResponseDto | null;
  @ApiProperty({ nullable: true }) currentCorrection!: unknown;
}

export class WorkOrderExecutionResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) technicianId!: string;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) startedAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
  @ApiProperty({ nullable: true }) checklist!: unknown;
  @ApiProperty({ type: [Object] }) evidence!: unknown[];
  @ApiProperty({ type: [Object] }) additionalItems!: unknown[];
  @ApiProperty({ type: String }) additionalTotalInCents!: string;
}

export class ChecklistAnswerDto {
  @ApiProperty() @IsString() @MaxLength(80) fieldId!: string;
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
  })
  @IsDefined()
  value!: string | number | boolean;
}

export class UpdateWorkOrderChecklistDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ type: [ChecklistAnswerDto] })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChecklistAnswerDto)
  responses!: ChecklistAnswerDto[];
}

export class StartWorkOrderExecutionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class SubmitForReviewDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class ResumeCorrectionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class UpdateWorkOrderExecutionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ nullable: true, maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

export class TechnicianWorkOrderPageDto {
  @ApiProperty({ type: [TechnicianWorkOrderResponseDto] })
  items!: TechnicianWorkOrderResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
  @ApiProperty() timezone!: string;
}

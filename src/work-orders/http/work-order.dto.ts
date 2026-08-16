import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  workOrderPriorities,
  workOrderStatuses,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from '../domain/work-order';

const orderOptions = [
  'CREATED_AT_DESC',
  'CREATED_AT_ASC',
  'NUMBER_DESC',
  'NUMBER_ASC',
  'SCHEDULED_START_ASC',
] as const;
type WorkOrderOrder = (typeof orderOptions)[number];

function trim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
}

export class ListWorkOrdersQueryDto {
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

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  search?: string;

  @ApiPropertyOptional({ enum: workOrderStatuses })
  @IsOptional()
  @IsIn(workOrderStatuses)
  status?: WorkOrderStatus;

  @ApiPropertyOptional({ enum: workOrderPriorities })
  @IsOptional()
  @IsIn(workOrderPriorities)
  priority?: WorkOrderPriority;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  equipmentId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdFrom?: Date;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdTo?: Date;

  @ApiPropertyOptional({ enum: orderOptions, default: 'CREATED_AT_DESC' })
  @IsIn(orderOptions)
  orderBy: WorkOrderOrder = 'CREATED_AT_DESC';
}

export class WorkOrderInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  locationId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  equipmentId?: string | null;

  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  serviceType!: string;

  @ApiProperty({ minLength: 2, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @ApiProperty({ minLength: 2, maxLength: 4000 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  description!: string;

  @ApiPropertyOptional({ enum: workOrderPriorities, default: 'NORMAL' })
  @IsOptional()
  @IsIn(workOrderPriorities)
  priority?: WorkOrderPriority;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledStartAt?: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledEndAt?: Date | null;

  @ApiPropertyOptional({ type: String, pattern: '^\\d{1,18}$', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,18}$/)
  expectedAmountInCents?: string | null;
}

export class UpdateWorkOrderDto extends PartialType(WorkOrderInputDto) {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class CancelDraftDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class WorkOrderResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'OS-000001' }) number!: string;
  @ApiProperty({ format: 'uuid' }) customerId!: string;
  @ApiProperty({ format: 'uuid' }) locationId!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) equipmentId!: string | null;
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
  @ApiProperty({ type: String, nullable: true })
  expectedAmountInCents!: string | null;
  @ApiProperty({ type: String, nullable: true }) finalAmountInCents!:
    string | null;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'uuid' }) createdByUserId!: string;
  @ApiProperty({ format: 'uuid', nullable: true })
  canceledByUserId!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true })
  canceledAt!: Date | null;
  @ApiProperty({ nullable: true }) cancellationReason!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class WorkOrderHistoryResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: workOrderStatuses, nullable: true })
  previousStatus!: WorkOrderStatus | null;
  @ApiProperty({ enum: workOrderStatuses }) newStatus!: WorkOrderStatus;
  @ApiProperty({ format: 'uuid' }) actorUserId!: string;
  @ApiProperty({ nullable: true }) reason!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class WorkOrderDetailsResponseDto extends WorkOrderResponseDto {
  @ApiProperty({ type: [WorkOrderHistoryResponseDto] })
  history!: WorkOrderHistoryResponseDto[];
}

export class WorkOrderPageResponseDto {
  @ApiProperty({ type: [WorkOrderResponseDto] }) items!: WorkOrderResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}

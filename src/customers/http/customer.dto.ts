import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { ArchiveFilter, LocationStatus } from '../domain/customer';

const archiveFilters = ['ACTIVE', 'ARCHIVED', 'ALL'] as const;
const locationStatuses = ['ACTIVE', 'INACTIVE'] as const;

function trim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
}

class PaginationQueryDto {
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
}

export class ListCustomersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: archiveFilters, default: 'ACTIVE' })
  @IsIn(archiveFilters)
  archive: ArchiveFilter = 'ACTIVE';
}

export class CustomerInputDto {
  @ApiProperty({ minLength: 2, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 32 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  document?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'email', maxLength: 320 })
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(320)
  email?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 32 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateCustomerDto extends PartialType(CustomerInputDto) {}

export class CustomerResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) document!: string | null;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ nullable: true, format: 'date-time' })
  archivedAt!: Date | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class CustomerPageResponseDto {
  @ApiProperty({ type: [CustomerResponseDto] }) items!: CustomerResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}

export class ListLocationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: locationStatuses })
  @IsOptional()
  @IsIn(locationStatuses)
  status?: LocationStatus;
}

export class LocationInputDto {
  @ApiProperty({ minLength: 2, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ maxLength: 16 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(16)
  postalCode!: string;

  @ApiProperty({ maxLength: 160 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  street!: string;

  @ApiProperty({ maxLength: 32 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  number!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  complement?: string | null;

  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  neighborhood!: string;

  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city!: string;

  @ApiProperty({ minLength: 2, maxLength: 2, example: 'SP' })
  @Transform(trim)
  @IsString()
  @Length(2, 2)
  state!: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 2, default: 'BR' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 160 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  contactName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 32 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  contactPhone?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  accessInstructions?: string | null;

  @ApiPropertyOptional({ enum: locationStatuses, default: 'ACTIVE' })
  @IsOptional()
  @IsIn(locationStatuses)
  status?: LocationStatus;
}

export class UpdateLocationDto extends PartialType(LocationInputDto) {}

export class LocationResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) customerId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() postalCode!: string;
  @ApiProperty() street!: string;
  @ApiProperty() number!: string;
  @ApiProperty({ nullable: true }) complement!: string | null;
  @ApiProperty() neighborhood!: string;
  @ApiProperty() city!: string;
  @ApiProperty() state!: string;
  @ApiProperty() country!: string;
  @ApiProperty({ nullable: true }) contactName!: string | null;
  @ApiProperty({ nullable: true }) contactPhone!: string | null;
  @ApiProperty({ nullable: true }) accessInstructions!: string | null;
  @ApiProperty({ enum: locationStatuses }) status!: LocationStatus;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class LocationPageResponseDto {
  @ApiProperty({ type: [LocationResponseDto] }) items!: LocationResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}

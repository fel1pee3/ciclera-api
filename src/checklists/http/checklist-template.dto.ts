import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  checklistFieldTypes,
  type ChecklistFieldType,
} from '../domain/checklist';

export class ChecklistFieldDefinitionDto {
  @ApiProperty({ example: 'pressure' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{1,79}$/)
  id!: string;

  @ApiProperty({ example: 'Pressão medida' })
  @IsString()
  @MaxLength(160)
  label!: string;

  @ApiProperty({ enum: checklistFieldTypes })
  @IsIn(checklistFieldTypes)
  type!: ChecklistFieldType;

  @ApiProperty()
  @IsBoolean()
  required!: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  options?: string[];
}

export class CreateChecklistTemplateVersionDto {
  @ApiProperty({ example: 'Checklist padrão' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ type: [ChecklistFieldDefinitionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChecklistFieldDefinitionDto)
  fields!: ChecklistFieldDefinitionDto[];
}

export class ChecklistTemplateResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: [ChecklistFieldDefinitionDto] })
  fields!: ChecklistFieldDefinitionDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

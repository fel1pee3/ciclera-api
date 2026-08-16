import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  additionalItemTypes,
  type AdditionalItemType,
} from '../domain/additional-item';

export class AdditionalItemInputDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ enum: additionalItemTypes })
  @IsIn(additionalItemTypes)
  type!: AdditionalItemType;
  @ApiProperty() @IsString() @MaxLength(500) description!: string;
  @ApiProperty({ example: '1.5' })
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/)
  quantity!: string;
  @ApiProperty({ example: '12500' })
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})$/)
  unitAmountInCents!: string;
}

export class AdditionalItemVersionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}

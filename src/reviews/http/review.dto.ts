import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';

export class ReviewQueueQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @ApiPropertyOptional({ enum: ['AGING_DESC', 'EXPECTED_AMOUNT_DESC'] })
  @IsIn(['AGING_DESC', 'EXPECTED_AMOUNT_DESC'])
  orderBy: 'AGING_DESC' | 'EXPECTED_AMOUNT_DESC' = 'AGING_DESC';
}

export class ReviewQueueResponseDto {
  @ApiProperty({ type: [Object] }) items!: unknown[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}

export class ReviewDetailsResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}

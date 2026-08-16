import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { reviewReasons, type ReviewReason } from '../domain/review';

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

export class RequestCorrectionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ enum: reviewReasons })
  @IsIn(reviewReasons)
  reason!: ReviewReason;

  @ApiProperty({ minLength: 3, maxLength: 2000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description!: string;
}

export class ApproveReviewDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

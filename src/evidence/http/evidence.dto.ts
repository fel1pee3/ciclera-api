import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateEvidenceIntentDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty() @IsString() @MaxLength(255) fileName!: string;
  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @MaxLength(120)
  contentType!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(25 * 1024 * 1024) sizeBytes!: number;
}

export class EvidenceVersionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}

export class EvidenceTokenQueryDto {
  @IsString() @MaxLength(2_000) token!: string;
}

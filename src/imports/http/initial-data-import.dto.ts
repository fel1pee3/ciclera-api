import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches, MaxLength } from 'class-validator';

export class PreviewInitialDataImportDto {
  @ApiProperty({ description: 'Conteúdo UTF-8 do CSV, limitado a 90 KB.' })
  @IsString()
  @MaxLength(90_000)
  content!: string;
}

export class CommitInitialDataImportDto extends PreviewInitialDataImportDto {
  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  @IsString()
  @Length(64, 64)
  @Matches(/^[a-f0-9]{64}$/)
  checksum!: string;
}

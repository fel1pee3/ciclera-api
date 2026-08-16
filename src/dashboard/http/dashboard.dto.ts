import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class DashboardSummaryQueryDto {
  @ApiPropertyOptional({ format: 'date', description: 'Data local inicial.' })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Data local final.' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

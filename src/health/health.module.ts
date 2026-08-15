import { Module } from '@nestjs/common';
import { DatabaseHealthService } from './database-health.service';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  providers: [DatabaseHealthService],
  exports: [DatabaseHealthService],
})
export class HealthModule {}

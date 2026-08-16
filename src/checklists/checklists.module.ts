import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { ChecklistTemplatesService } from './application/checklist-templates.service';
import { CHECKLIST_TEMPLATE_REPOSITORY } from './application/ports/checklist-template.repository';
import { ChecklistTemplatesController } from './http/checklist-templates.controller';
import { PrismaChecklistTemplateRepository } from './infrastructure/prisma-checklist-template.repository';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ChecklistTemplatesController],
  providers: [
    ChecklistTemplatesService,
    {
      provide: CHECKLIST_TEMPLATE_REPOSITORY,
      useClass: PrismaChecklistTemplateRepository,
    },
  ],
})
export class ChecklistsModule {}

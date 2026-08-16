import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type { ChecklistFieldDefinition } from '../domain/checklist';
import type {
  ChecklistTemplateRecord,
  ChecklistTemplateRepository,
} from '../application/ports/checklist-template.repository';

@Injectable()
export class PrismaChecklistTemplateRepository implements ChecklistTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createVersion(
    input: Parameters<ChecklistTemplateRepository['createVersion']>[0],
  ): Promise<ChecklistTemplateRecord> {
    return this.prisma.$transaction(
      async (transaction) => {
        const latest = await transaction.checklistTemplate.findFirst({
          where: {
            organizationId: input.organizationId,
            templateKey: 'default',
          },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const created = await transaction.checklistTemplate.create({
          data: {
            organizationId: input.organizationId,
            createdByUserId: input.actorUserId,
            name: input.name,
            version: (latest?.version ?? 0) + 1,
            fields: input.fields as unknown as Prisma.InputJsonValue,
          },
        });
        await transaction.auditLog.create({
          data: {
            organizationId: input.organizationId,
            actorUserId: input.actorUserId,
            requestId: input.requestId,
            action: 'CHECKLIST_TEMPLATE_VERSION_CREATED',
            resourceType: 'CHECKLIST_TEMPLATE',
            resourceId: created.id,
            metadata: { version: created.version },
          },
        });
        return mapTemplate(created);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findCurrent(organizationId: string) {
    const template = await this.prisma.checklistTemplate.findFirst({
      where: { organizationId, templateKey: 'default' },
      orderBy: { version: 'desc' },
    });
    return template ? mapTemplate(template) : null;
  }
}

function mapTemplate(template: {
  id: string;
  name: string;
  version: number;
  fields: Prisma.JsonValue;
  createdAt: Date;
}): ChecklistTemplateRecord {
  return {
    ...template,
    fields: template.fields as unknown as ChecklistFieldDefinition[],
  };
}

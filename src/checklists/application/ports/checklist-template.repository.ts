import type { ChecklistFieldDefinition } from '../../domain/checklist';

export const CHECKLIST_TEMPLATE_REPOSITORY = Symbol(
  'CHECKLIST_TEMPLATE_REPOSITORY',
);

export interface ChecklistTemplateRecord {
  id: string;
  name: string;
  version: number;
  fields: ChecklistFieldDefinition[];
  createdAt: Date;
}

export interface ChecklistTemplateRepository {
  createVersion(input: {
    organizationId: string;
    actorUserId: string;
    requestId: string;
    name: string;
    fields: ChecklistFieldDefinition[];
  }): Promise<ChecklistTemplateRecord>;
  findCurrent(organizationId: string): Promise<ChecklistTemplateRecord | null>;
}

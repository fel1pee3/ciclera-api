import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { optionalText } from '../../customers/domain/normalization';
import { assertChecklistFields } from '../domain/checklist';
import type { ChecklistFieldDefinition } from '../domain/checklist';
import { ChecklistDefinitionInvalidError } from '../domain/checklist.errors';
import {
  CHECKLIST_TEMPLATE_REPOSITORY,
  type ChecklistTemplateRepository,
} from './ports/checklist-template.repository';

@Injectable()
export class ChecklistTemplatesService {
  constructor(
    @Inject(CHECKLIST_TEMPLATE_REPOSITORY)
    private readonly templates: ChecklistTemplateRepository,
  ) {}

  current(principal: AuthenticatedPrincipal) {
    return this.templates.findCurrent(principal.organizationId);
  }

  createVersion(
    principal: AuthenticatedPrincipal,
    requestId: string,
    input: {
      name: string;
      fields: ChecklistFieldDefinition[];
      requirePhoto?: boolean;
      requireSignature?: boolean;
    },
  ) {
    const name = optionalText(input.name);
    if (!name) throw new ChecklistDefinitionInvalidError();
    try {
      assertChecklistFields(input.fields);
    } catch {
      throw new ChecklistDefinitionInvalidError();
    }
    return this.templates.createVersion({
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId,
      name,
      requirePhoto: input.requirePhoto ?? false,
      requireSignature: input.requireSignature ?? false,
      fields: input.fields.map((field) => ({
        ...field,
        label: field.label.trim(),
        ...(field.options
          ? { options: field.options.map((option) => option.trim()) }
          : {}),
      })),
    });
  }
}

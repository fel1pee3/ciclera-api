export const checklistFieldTypes = [
  'SHORT_TEXT',
  'LONG_TEXT',
  'NUMBER',
  'BOOLEAN',
  'SELECT',
] as const;

export type ChecklistFieldType = (typeof checklistFieldTypes)[number];
export type ChecklistValue = string | number | boolean;

export interface ChecklistFieldDefinition {
  id: string;
  label: string;
  type: ChecklistFieldType;
  required: boolean;
  options?: string[];
}

export interface ChecklistSnapshot {
  templateId: string;
  name: string;
  version: number;
  fields: ChecklistFieldDefinition[];
  requirePhoto: boolean;
  requireSignature: boolean;
}

export interface ChecklistAnswer {
  fieldId: string;
  value: ChecklistValue;
}

export function assertChecklistFields(
  fields: ChecklistFieldDefinition[],
): void {
  if (fields.length === 0 || fields.length > 50) {
    throw new Error('INVALID_CHECKLIST_FIELDS');
  }
  const ids = new Set<string>();
  for (const field of fields) {
    if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(field.id) || ids.has(field.id)) {
      throw new Error('INVALID_CHECKLIST_FIELDS');
    }
    ids.add(field.id);
    if (!field.label.trim() || field.label.length > 160) {
      throw new Error('INVALID_CHECKLIST_FIELDS');
    }
    if (field.type === 'SELECT') {
      if (!field.options?.length || field.options.length > 30) {
        throw new Error('INVALID_CHECKLIST_FIELDS');
      }
      if (new Set(field.options).size !== field.options.length) {
        throw new Error('INVALID_CHECKLIST_FIELDS');
      }
    } else if (field.options?.length) {
      throw new Error('INVALID_CHECKLIST_FIELDS');
    }
  }
}

export function assertChecklistAnswers(
  snapshot: ChecklistSnapshot,
  answers: ChecklistAnswer[],
): void {
  const fields = new Map(snapshot.fields.map((field) => [field.id, field]));
  const answered = new Set<string>();
  for (const answer of answers) {
    const field = fields.get(answer.fieldId);
    if (!field || answered.has(answer.fieldId)) {
      throw new Error('INVALID_CHECKLIST_RESPONSE');
    }
    answered.add(answer.fieldId);
    if (!isCompatibleValue(field, answer.value)) {
      throw new Error('INVALID_CHECKLIST_RESPONSE');
    }
  }
}

export function missingRequiredFieldIds(
  snapshot: ChecklistSnapshot,
  answers: ChecklistAnswer[],
): string[] {
  const values = new Map(
    answers.map((answer) => [answer.fieldId, answer.value]),
  );
  return snapshot.fields
    .filter((field) => field.required && isEmpty(values.get(field.id)))
    .map((field) => field.id);
}

function isCompatibleValue(
  field: ChecklistFieldDefinition,
  value: ChecklistValue,
): boolean {
  if (field.type === 'BOOLEAN') return typeof value === 'boolean';
  if (field.type === 'NUMBER') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  if (typeof value !== 'string') return false;
  if (field.type === 'SHORT_TEXT') return value.length <= 500;
  if (field.type === 'LONG_TEXT') return value.length <= 4000;
  return field.options?.includes(value) === true;
}

function isEmpty(value: ChecklistValue | undefined): boolean {
  return value === undefined || (typeof value === 'string' && !value.trim());
}

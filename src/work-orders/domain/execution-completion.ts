import {
  missingRequiredFieldIds,
  type ChecklistAnswer,
  type ChecklistSnapshot,
} from '../../checklists/domain/checklist';
import type { ExecutionCompletionIssue } from '../application/ports/technician-work-order.repository';

export function executionCompletionIssues(input: {
  checklistSnapshot: unknown;
  checklistResponses: Array<{ fieldId: string; value: unknown }>;
  evidence: Array<{ kind: 'PHOTO' | 'SIGNATURE' }>;
}): ExecutionCompletionIssue[] {
  const snapshot = input.checklistSnapshot as ChecklistSnapshot | null;
  const responses = input.checklistResponses.map((response) => ({
    fieldId: response.fieldId,
    value: response.value as ChecklistAnswer['value'],
  }));
  const issues: ExecutionCompletionIssue[] = [];
  if (snapshot && missingRequiredFieldIds(snapshot, responses).length) {
    issues.push('CHECKLIST_INCOMPLETE');
  }
  if (
    snapshot?.requirePhoto &&
    !input.evidence.some((item) => item.kind === 'PHOTO')
  ) {
    issues.push('PHOTO_REQUIRED');
  }
  if (
    snapshot?.requireSignature &&
    !input.evidence.some((item) => item.kind === 'SIGNATURE')
  ) {
    issues.push('SIGNATURE_REQUIRED');
  }
  return issues;
}

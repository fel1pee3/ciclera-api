export const reviewReasons = [
  'REQUIRED_PHOTO_MISSING',
  'SIGNATURE_MISSING',
  'CHECKLIST_INCOMPLETE',
  'MATERIAL_WITHOUT_VALUE',
  'ADDITIONAL_SERVICE_UNAPPROVED',
  'EQUIPMENT_DATA_INCORRECT',
  'INCONSISTENT_SCHEDULE',
  'OTHER',
] as const;

export type ReviewReason = (typeof reviewReasons)[number];
export type ReviewDecision = 'CORRECTION_REQUESTED' | 'APPROVED';

export interface ReviewRecord {
  id: string;
  decision: ReviewDecision;
  reason: ReviewReason | null;
  description: string | null;
  actorUserId: string;
  actorName: string;
  createdAt: Date;
}

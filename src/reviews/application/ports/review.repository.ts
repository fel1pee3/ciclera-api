import type {
  ChecklistAnswer,
  ChecklistSnapshot,
} from '../../../checklists/domain/checklist';
import type { WorkOrderPriority } from '../../../work-orders/domain/work-order';
import type { ReviewReason, ReviewRecord } from '../../domain/review';

export const REVIEW_REPOSITORY = Symbol('REVIEW_REPOSITORY');

export interface ReviewQueueItem {
  id: string;
  number: bigint;
  title: string;
  priority: WorkOrderPriority;
  customer: { id: string; name: string };
  expectedAmountInCents: bigint | null;
  additionalTotalInCents: bigint;
  waitingSince: Date;
  agingSeconds: number;
  version: number;
}

export interface ReviewDetails extends ReviewQueueItem {
  description: string;
  serviceType: string;
  location: { id: string; name: string; address: string };
  equipment: { id: string; name: string; identifier: string } | null;
  execution: {
    id: string;
    notes: string | null;
    startedAt: Date;
    updatedAt: Date;
    checklist: {
      snapshot: ChecklistSnapshot;
      responses: ChecklistAnswer[];
      missingRequiredFieldIds: string[];
    } | null;
    evidence: Array<{
      id: string;
      kind: 'PHOTO' | 'SIGNATURE';
      fileName: string;
      contentType: string;
      sizeBytes: bigint;
      confirmedAt: Date;
    }>;
    additionalItems: Array<{
      id: string;
      type: 'MATERIAL' | 'SERVICE' | 'ADDITIONAL_HOUR';
      description: string;
      quantityInThousand: bigint;
      unitAmountInCents: bigint;
      totalAmountInCents: bigint;
    }>;
  };
  reviews: ReviewRecord[];
}

export type ReviewMutationResult =
  | { status: 'SUCCESS' | 'ALREADY_CHANGED' }
  | { status: 'NOT_FOUND' }
  | { status: 'STATUS_LOCKED' }
  | { status: 'VERSION_CONFLICT' };

export interface ReviewRepository {
  list(input: {
    organizationId: string;
    page: number;
    pageSize: number;
    orderBy: 'AGING_DESC' | 'EXPECTED_AMOUNT_DESC';
  }): Promise<{
    items: ReviewQueueItem[];
    page: number;
    pageSize: number;
    total: number;
  }>;
  find(
    organizationId: string,
    workOrderId: string,
  ): Promise<ReviewDetails | null>;
  requestCorrection(input: {
    organizationId: string;
    actorUserId: string;
    requestId: string;
    workOrderId: string;
    expectedVersion: number;
    reason: ReviewReason;
    description: string;
  }): Promise<ReviewMutationResult>;
}

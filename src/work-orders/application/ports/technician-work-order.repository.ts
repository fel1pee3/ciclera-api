import type {
  WorkOrderPriority,
  WorkOrderStatus,
} from '../../domain/work-order';
import type {
  ChecklistAnswer,
  ChecklistSnapshot,
} from '../../../checklists/domain/checklist';

export const TECHNICIAN_WORK_ORDER_REPOSITORY = Symbol(
  'TECHNICIAN_WORK_ORDER_REPOSITORY',
);

export const technicianWorkOrderViews = [
  'TODAY',
  'UPCOMING',
  'IN_PROGRESS',
  'PENDING',
] as const;
export type TechnicianWorkOrderView = (typeof technicianWorkOrderViews)[number];

export interface TechnicianWorkOrder {
  id: string;
  number: bigint;
  customer: { id: string; name: string };
  location: {
    id: string;
    name: string;
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
  };
  equipment: { id: string; name: string; identifier: string } | null;
  serviceType: string;
  title: string;
  description: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  version: number;
  execution: WorkOrderExecution | null;
  currentCorrection: {
    id: string;
    reason: string;
    description: string;
    requestedAt: Date;
  } | null;
}

export interface WorkOrderExecution {
  id: string;
  technicianId: string;
  notes: string | null;
  version: number;
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
    createdAt: Date;
  }>;
  additionalItems: Array<{
    id: string;
    type: 'MATERIAL' | 'SERVICE' | 'ADDITIONAL_HOUR';
    description: string;
    quantityInThousand: bigint;
    unitAmountInCents: bigint;
    totalAmountInCents: bigint;
    createdAt: Date;
    updatedAt: Date;
  }>;
  additionalTotalInCents: bigint;
}

export type TechnicianExecutionMutationResult =
  | { status: 'SUCCESS' }
  | { status: 'NOT_FOUND' }
  | { status: 'STATUS_LOCKED' }
  | { status: 'VERSION_CONFLICT' }
  | { status: 'EXECUTION_EXISTS' }
  | { status: 'EXECUTION_NOT_FOUND' }
  | { status: 'INVALID_CHECKLIST_RESPONSE' };

export type ExecutionCompletionIssue =
  'CHECKLIST_INCOMPLETE' | 'PHOTO_REQUIRED' | 'SIGNATURE_REQUIRED';

export type SubmitForReviewResult =
  | { status: 'SUCCESS' | 'ALREADY_SUBMITTED' }
  | { status: 'NOT_FOUND' }
  | { status: 'STATUS_LOCKED' }
  | { status: 'VERSION_CONFLICT' }
  | { status: 'EXECUTION_NOT_FOUND' }
  | { status: 'INCOMPLETE'; issues: ExecutionCompletionIssue[] };

export type ResumeCorrectionResult =
  | { status: 'SUCCESS' | 'ALREADY_RESUMED' }
  | { status: 'NOT_FOUND' }
  | { status: 'STATUS_LOCKED' }
  | { status: 'VERSION_CONFLICT' };

export interface TechnicianWorkOrderRepository {
  list(input: {
    organizationId: string;
    technicianId: string;
    page: number;
    pageSize: number;
    view?: TechnicianWorkOrderView;
  }): Promise<{
    items: TechnicianWorkOrder[];
    page: number;
    pageSize: number;
    total: number;
    timezone: string;
  }>;
  find(
    organizationId: string,
    technicianId: string,
    workOrderId: string,
  ): Promise<TechnicianWorkOrder | null>;
  startExecution(input: {
    organizationId: string;
    technicianId: string;
    workOrderId: string;
    expectedVersion: number;
    requestId: string;
  }): Promise<TechnicianExecutionMutationResult>;
  updateExecution(input: {
    organizationId: string;
    technicianId: string;
    workOrderId: string;
    expectedVersion: number;
    notes: string | null;
    requestId: string;
  }): Promise<TechnicianExecutionMutationResult>;
  updateChecklist(input: {
    organizationId: string;
    technicianId: string;
    workOrderId: string;
    expectedVersion: number;
    responses: ChecklistAnswer[];
    requestId: string;
  }): Promise<TechnicianExecutionMutationResult>;
  submitForReview(input: {
    organizationId: string;
    technicianId: string;
    workOrderId: string;
    expectedVersion: number;
    requestId: string;
  }): Promise<SubmitForReviewResult>;
  resumeCorrection(input: {
    organizationId: string;
    technicianId: string;
    workOrderId: string;
    expectedVersion: number;
    requestId: string;
  }): Promise<ResumeCorrectionResult>;
}

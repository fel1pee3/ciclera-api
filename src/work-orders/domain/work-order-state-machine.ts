import type { WorkOrderStatus } from './work-order';

export const workOrderActions = [
  'SCHEDULE',
  'RESCHEDULE',
  'START',
  'SUBMIT_FOR_REVIEW',
  'REQUEST_CORRECTION',
  'RESUME_CORRECTION',
  'APPROVE',
  'MARK_BILLED',
  'CANCEL',
] as const;
export type WorkOrderAction = (typeof workOrderActions)[number];

const transitions: Record<
  WorkOrderAction,
  Partial<Record<WorkOrderStatus, WorkOrderStatus>>
> = {
  SCHEDULE: { DRAFT: 'SCHEDULED' },
  RESCHEDULE: { SCHEDULED: 'SCHEDULED' },
  START: { SCHEDULED: 'IN_PROGRESS' },
  SUBMIT_FOR_REVIEW: { IN_PROGRESS: 'AWAITING_REVIEW' },
  REQUEST_CORRECTION: { AWAITING_REVIEW: 'PENDING_CORRECTION' },
  RESUME_CORRECTION: { PENDING_CORRECTION: 'IN_PROGRESS' },
  APPROVE: { AWAITING_REVIEW: 'READY_TO_BILL' },
  MARK_BILLED: { READY_TO_BILL: 'BILLED' },
  CANCEL: { DRAFT: 'CANCELED', SCHEDULED: 'CANCELED' },
};

export function transitionWorkOrderStatus(
  current: WorkOrderStatus,
  action: WorkOrderAction,
): WorkOrderStatus {
  const next = transitions[action][current];
  if (!next) throw new InvalidWorkOrderTransitionError(current, action);
  return next;
}

export class InvalidWorkOrderTransitionError extends Error {
  constructor(
    readonly currentStatus: WorkOrderStatus,
    readonly action: WorkOrderAction,
  ) {
    super(`Action ${action} is not allowed from ${currentStatus}.`);
  }
}

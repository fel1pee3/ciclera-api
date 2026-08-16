export const workOrderStatuses = [
  'DRAFT',
  'SCHEDULED',
  'IN_PROGRESS',
  'AWAITING_REVIEW',
  'PENDING_CORRECTION',
  'READY_TO_BILL',
  'BILLED',
  'CANCELED',
] as const;
export type WorkOrderStatus = (typeof workOrderStatuses)[number];

export const workOrderPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type WorkOrderPriority = (typeof workOrderPriorities)[number];

export interface WorkOrder {
  id: string;
  number: bigint;
  customerId: string;
  locationId: string;
  equipmentId: string | null;
  serviceType: string;
  title: string;
  description: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  expectedAmountInCents: bigint | null;
  finalAmountInCents: bigint | null;
  version: number;
  createdByUserId: string;
  canceledByUserId: string | null;
  canceledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkOrderStatusHistoryEntry {
  id: string;
  previousStatus: WorkOrderStatus | null;
  newStatus: WorkOrderStatus;
  actorUserId: string;
  reason: string | null;
  createdAt: Date;
}

export interface WorkOrderAssignment {
  id: string;
  technicianId: string;
  technicianName: string;
  assignedByUserId: string;
  assignedAt: Date;
  unassignedByUserId: string | null;
  unassignedAt: Date | null;
}

export interface WorkOrderDetails extends WorkOrder {
  history: WorkOrderStatusHistoryEntry[];
  assignments: WorkOrderAssignment[];
}

export interface ScheduledWorkOrder extends WorkOrder {
  activeAssignment: WorkOrderAssignment;
}

export function formatWorkOrderNumber(number: bigint): string {
  if (number <= 0n) throw new InvalidWorkOrderNumberError();
  return `OS-${number.toString().padStart(6, '0')}`;
}

export class InvalidWorkOrderNumberError extends Error {}

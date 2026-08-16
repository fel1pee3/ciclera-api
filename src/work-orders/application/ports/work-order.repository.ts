import type { WorkOrder, WorkOrderPriority } from '../../domain/work-order';
import type { WorkOrderAction } from '../../domain/work-order-state-machine';

export const WORK_ORDER_REPOSITORY = Symbol('WORK_ORDER_REPOSITORY');

export interface WorkOrderMutationContext {
  organizationId: string;
  actorUserId: string;
  requestId: string;
}

export interface CreateDraftData {
  customerId: string;
  locationId: string;
  equipmentId: string | null;
  serviceType: string;
  title: string;
  normalizedTitle: string;
  description: string;
  priority: WorkOrderPriority;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  expectedAmountInCents: bigint | null;
}

export type WorkOrderTransitionResult =
  | { status: 'SUCCESS'; workOrder: WorkOrder }
  | { status: 'NOT_FOUND' }
  | { status: 'VERSION_CONFLICT' };

export interface WorkOrderRepository {
  createDraft(
    input: WorkOrderMutationContext & CreateDraftData,
  ): Promise<WorkOrder>;
  transition(
    input: WorkOrderMutationContext & {
      workOrderId: string;
      expectedVersion: number;
      action: WorkOrderAction;
      reason?: string | null;
    },
  ): Promise<WorkOrderTransitionResult>;
}

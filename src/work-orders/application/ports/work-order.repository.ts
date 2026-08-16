import type {
  WorkOrder,
  WorkOrderDetails,
  WorkOrderPriority,
  WorkOrderStatus,
  ScheduledWorkOrder,
} from '../../domain/work-order';
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

export type WorkOrderUpdateResult =
  | { status: 'SUCCESS'; workOrder: WorkOrder }
  | { status: 'NOT_FOUND' }
  | { status: 'STATUS_LOCKED' }
  | { status: 'VERSION_CONFLICT' };

export type WorkOrderPlanningResult =
  | { status: 'SUCCESS' }
  | { status: 'NOT_FOUND' }
  | { status: 'STATUS_LOCKED' }
  | { status: 'VERSION_CONFLICT' }
  | { status: 'TECHNICIAN_INVALID' }
  | { status: 'ASSIGNMENT_INVALID' };

export interface UpdateDraftData {
  customerId?: string;
  locationId?: string;
  equipmentId?: string | null;
  serviceType?: string;
  title?: string;
  normalizedTitle?: string;
  description?: string;
  priority?: WorkOrderPriority;
  scheduledStartAt?: Date | null;
  scheduledEndAt?: Date | null;
  expectedAmountInCents?: bigint | null;
}

export interface WorkOrderRepository {
  list(input: {
    organizationId: string;
    page: number;
    pageSize: number;
    search?: string;
    status?: WorkOrderStatus;
    priority?: WorkOrderPriority;
    customerId?: string;
    locationId?: string;
    equipmentId?: string;
    createdFrom?: Date;
    createdTo?: Date;
    orderBy:
      | 'CREATED_AT_DESC'
      | 'CREATED_AT_ASC'
      | 'NUMBER_DESC'
      | 'NUMBER_ASC'
      | 'SCHEDULED_START_ASC';
  }): Promise<{
    items: WorkOrder[];
    page: number;
    pageSize: number;
    total: number;
  }>;
  find(
    organizationId: string,
    workOrderId: string,
  ): Promise<WorkOrderDetails | null>;
  createDraft(
    input: WorkOrderMutationContext & CreateDraftData,
  ): Promise<WorkOrder>;
  updateDraft(
    input: WorkOrderMutationContext &
      UpdateDraftData & { workOrderId: string; expectedVersion: number },
  ): Promise<WorkOrderUpdateResult>;
  transition(
    input: WorkOrderMutationContext & {
      workOrderId: string;
      expectedVersion: number;
      action: WorkOrderAction;
      reason?: string | null;
    },
  ): Promise<WorkOrderTransitionResult>;
  schedule(
    input: WorkOrderMutationContext & {
      workOrderId: string;
      expectedVersion: number;
      technicianId: string;
      scheduledStartAt: Date;
      scheduledEndAt: Date;
    },
  ): Promise<WorkOrderPlanningResult>;
  reschedule(
    input: WorkOrderMutationContext & {
      workOrderId: string;
      expectedVersion: number;
      scheduledStartAt: Date;
      scheduledEndAt: Date;
    },
  ): Promise<WorkOrderPlanningResult>;
  reassign(
    input: WorkOrderMutationContext & {
      workOrderId: string;
      expectedVersion: number;
      technicianId: string;
    },
  ): Promise<WorkOrderPlanningResult>;
  agenda(input: {
    organizationId: string;
    from: string;
    to: string;
    technicianId?: string;
    status?: WorkOrderStatus;
  }): Promise<{
    items: ScheduledWorkOrder[];
    timezone: string;
    from: string;
    to: string;
  }>;
}

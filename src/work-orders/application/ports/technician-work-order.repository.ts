import type {
  WorkOrderPriority,
  WorkOrderStatus,
} from '../../domain/work-order';

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
}

export interface WorkOrderExecution {
  id: string;
  technicianId: string;
  notes: string | null;
  version: number;
  startedAt: Date;
  updatedAt: Date;
}

export type TechnicianExecutionMutationResult =
  | { status: 'SUCCESS' }
  | { status: 'NOT_FOUND' }
  | { status: 'STATUS_LOCKED' }
  | { status: 'VERSION_CONFLICT' }
  | { status: 'EXECUTION_EXISTS' }
  | { status: 'EXECUTION_NOT_FOUND' };

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
}

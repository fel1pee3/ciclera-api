import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { optionalText } from '../../customers/domain/normalization';
import {
  WorkOrderExecutionAlreadyStartedError,
  WorkOrderExecutionNotFoundError,
  WorkOrderNotFoundError,
  WorkOrderStatusLockedError,
  WorkOrderVersionConflictError,
  ChecklistResponseInvalidError,
} from '../domain/work-order.errors';
import {
  TECHNICIAN_WORK_ORDER_REPOSITORY,
  type TechnicianWorkOrderRepository,
  type TechnicianWorkOrderView,
} from './ports/technician-work-order.repository';

@Injectable()
export class TechnicianWorkOrdersService {
  constructor(
    @Inject(TECHNICIAN_WORK_ORDER_REPOSITORY)
    private readonly workOrders: TechnicianWorkOrderRepository,
  ) {}

  list(
    principal: AuthenticatedPrincipal,
    query: { page: number; pageSize: number; view?: TechnicianWorkOrderView },
  ) {
    return this.workOrders.list({
      ...query,
      organizationId: principal.organizationId,
      technicianId: principal.userId,
    });
  }

  async find(principal: AuthenticatedPrincipal, workOrderId: string) {
    const workOrder = await this.workOrders.find(
      principal.organizationId,
      principal.userId,
      workOrderId,
    );
    if (!workOrder) throw new WorkOrderNotFoundError();
    return workOrder;
  }

  async start(
    principal: AuthenticatedPrincipal,
    requestId: string,
    workOrderId: string,
    expectedVersion: number,
  ) {
    resolveExecutionMutation(
      await this.workOrders.startExecution({
        organizationId: principal.organizationId,
        technicianId: principal.userId,
        workOrderId,
        expectedVersion,
        requestId,
      }),
    );
    return this.find(principal, workOrderId);
  }

  async updateExecution(
    principal: AuthenticatedPrincipal,
    requestId: string,
    workOrderId: string,
    expectedVersion: number,
    notes: string | null | undefined,
  ) {
    resolveExecutionMutation(
      await this.workOrders.updateExecution({
        organizationId: principal.organizationId,
        technicianId: principal.userId,
        workOrderId,
        expectedVersion,
        notes: optionalText(notes),
        requestId,
      }),
    );
    return this.find(principal, workOrderId);
  }

  async updateChecklist(
    principal: AuthenticatedPrincipal,
    requestId: string,
    workOrderId: string,
    expectedVersion: number,
    responses: Parameters<
      TechnicianWorkOrderRepository['updateChecklist']
    >[0]['responses'],
  ) {
    resolveExecutionMutation(
      await this.workOrders.updateChecklist({
        organizationId: principal.organizationId,
        technicianId: principal.userId,
        workOrderId,
        expectedVersion,
        responses,
        requestId,
      }),
    );
    return this.find(principal, workOrderId);
  }
}

function resolveExecutionMutation(
  result: Awaited<ReturnType<TechnicianWorkOrderRepository['startExecution']>>,
): void {
  if (result.status === 'NOT_FOUND') throw new WorkOrderNotFoundError();
  if (result.status === 'STATUS_LOCKED') throw new WorkOrderStatusLockedError();
  if (result.status === 'VERSION_CONFLICT') {
    throw new WorkOrderVersionConflictError();
  }
  if (result.status === 'EXECUTION_EXISTS') {
    throw new WorkOrderExecutionAlreadyStartedError();
  }
  if (result.status === 'EXECUTION_NOT_FOUND') {
    throw new WorkOrderExecutionNotFoundError();
  }
  if (result.status === 'INVALID_CHECKLIST_RESPONSE') {
    throw new ChecklistResponseInvalidError();
  }
}

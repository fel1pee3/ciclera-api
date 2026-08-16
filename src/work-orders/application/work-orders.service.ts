import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import {
  displayText,
  normalizedText,
  optionalText,
} from '../../customers/domain/normalization';
import type { WorkOrderPriority, WorkOrderStatus } from '../domain/work-order';
import {
  WorkOrderManagementForbiddenError,
  WorkOrderAssignmentInvalidError,
  WorkOrderNotFoundError,
  WorkOrderScheduleInvalidError,
  WorkOrderStatusLockedError,
  WorkOrderTechnicianInvalidError,
  WorkOrderVersionConflictError,
} from '../domain/work-order.errors';
import { InvalidWorkOrderTransitionError } from '../domain/work-order-state-machine';
import {
  WORK_ORDER_REPOSITORY,
  type CreateDraftData,
  type UpdateDraftData,
  type WorkOrderRepository,
} from './ports/work-order.repository';

export interface WorkOrderInput {
  customerId: string;
  locationId: string;
  equipmentId?: string | null;
  serviceType: string;
  title: string;
  description: string;
  priority?: WorkOrderPriority;
  scheduledStartAt?: Date | null;
  scheduledEndAt?: Date | null;
  expectedAmountInCents?: string | null;
}

interface RequestContext {
  principal: AuthenticatedPrincipal;
  requestId: string;
}

@Injectable()
export class WorkOrdersService {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY)
    private readonly workOrders: WorkOrderRepository,
  ) {}

  list(
    context: RequestContext,
    query: {
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
    },
  ) {
    this.requireManager(context.principal);
    validateSchedule(query.createdFrom ?? null, query.createdTo ?? null);
    return this.workOrders.list({
      ...query,
      organizationId: context.principal.organizationId,
      ...(query.search ? { search: normalizedText(query.search) } : {}),
    });
  }

  async find(context: RequestContext, workOrderId: string) {
    this.requireManager(context.principal);
    return this.requireFound(context.principal.organizationId, workOrderId);
  }

  async create(context: RequestContext, input: WorkOrderInput) {
    this.requireManager(context.principal);
    const data = createData(input);
    validateSchedule(data.scheduledStartAt, data.scheduledEndAt);
    const created = await this.workOrders.createDraft({
      ...mutationContext(context),
      ...data,
    });
    return this.requireFound(context.principal.organizationId, created.id);
  }

  async update(
    context: RequestContext,
    workOrderId: string,
    expectedVersion: number,
    input: Partial<WorkOrderInput>,
  ) {
    this.requireManager(context.principal);
    const current = await this.requireFound(
      context.principal.organizationId,
      workOrderId,
    );
    if (current.status !== 'DRAFT') throw new WorkOrderStatusLockedError();
    const data = updateData(input);
    validateSchedule(
      data.scheduledStartAt === undefined
        ? current.scheduledStartAt
        : data.scheduledStartAt,
      data.scheduledEndAt === undefined
        ? current.scheduledEndAt
        : data.scheduledEndAt,
    );
    const result = await this.workOrders.updateDraft({
      ...mutationContext(context),
      workOrderId,
      expectedVersion,
      ...data,
    });
    resolveMutation(result);
    return this.requireFound(context.principal.organizationId, workOrderId);
  }

  async cancelDraft(
    context: RequestContext,
    workOrderId: string,
    expectedVersion: number,
    reason: string,
  ) {
    this.requireManager(context.principal);
    const current = await this.requireFound(
      context.principal.organizationId,
      workOrderId,
    );
    if (current.status !== 'DRAFT') throw new WorkOrderStatusLockedError();
    try {
      const result = await this.workOrders.transition({
        ...mutationContext(context),
        workOrderId,
        expectedVersion,
        action: 'CANCEL',
        reason: displayText(reason),
      });
      resolveMutation(result);
    } catch (error) {
      if (error instanceof InvalidWorkOrderTransitionError) {
        throw new WorkOrderStatusLockedError();
      }
      throw error;
    }
    return this.requireFound(context.principal.organizationId, workOrderId);
  }

  async schedule(
    context: RequestContext,
    workOrderId: string,
    input: {
      version: number;
      technicianId: string;
      scheduledStartAt: Date;
      scheduledEndAt: Date;
    },
  ) {
    this.requireManager(context.principal);
    validateRequiredSchedule(input.scheduledStartAt, input.scheduledEndAt);
    resolvePlanning(
      await this.workOrders.schedule({
        ...mutationContext(context),
        workOrderId,
        expectedVersion: input.version,
        technicianId: input.technicianId,
        scheduledStartAt: input.scheduledStartAt,
        scheduledEndAt: input.scheduledEndAt,
      }),
    );
    return this.requireFound(context.principal.organizationId, workOrderId);
  }

  async reschedule(
    context: RequestContext,
    workOrderId: string,
    input: { version: number; scheduledStartAt: Date; scheduledEndAt: Date },
  ) {
    this.requireManager(context.principal);
    validateRequiredSchedule(input.scheduledStartAt, input.scheduledEndAt);
    resolvePlanning(
      await this.workOrders.reschedule({
        ...mutationContext(context),
        workOrderId,
        expectedVersion: input.version,
        scheduledStartAt: input.scheduledStartAt,
        scheduledEndAt: input.scheduledEndAt,
      }),
    );
    return this.requireFound(context.principal.organizationId, workOrderId);
  }

  async reassign(
    context: RequestContext,
    workOrderId: string,
    input: { version: number; technicianId: string },
  ) {
    this.requireManager(context.principal);
    resolvePlanning(
      await this.workOrders.reassign({
        ...mutationContext(context),
        workOrderId,
        expectedVersion: input.version,
        technicianId: input.technicianId,
      }),
    );
    return this.requireFound(context.principal.organizationId, workOrderId);
  }

  agenda(
    context: RequestContext,
    query: {
      from: string;
      to: string;
      technicianId?: string;
      status?: WorkOrderStatus;
    },
  ) {
    this.requireManager(context.principal);
    validateDatePeriod(query.from, query.to);
    return this.workOrders.agenda({
      ...query,
      organizationId: context.principal.organizationId,
    });
  }

  private async requireFound(organizationId: string, workOrderId: string) {
    const workOrder = await this.workOrders.find(organizationId, workOrderId);
    if (!workOrder) throw new WorkOrderNotFoundError();
    return workOrder;
  }

  private requireManager(principal: AuthenticatedPrincipal): void {
    if (principal.role === 'TECHNICIAN') {
      throw new WorkOrderManagementForbiddenError();
    }
  }
}

function mutationContext(context: RequestContext) {
  return {
    organizationId: context.principal.organizationId,
    actorUserId: context.principal.userId,
    requestId: context.requestId,
  };
}

function createData(input: WorkOrderInput): CreateDraftData {
  return {
    customerId: input.customerId,
    locationId: input.locationId,
    equipmentId: input.equipmentId ?? null,
    serviceType: displayText(input.serviceType),
    title: displayText(input.title),
    normalizedTitle: normalizedText(input.title),
    description: displayText(input.description),
    priority: input.priority ?? 'NORMAL',
    scheduledStartAt: input.scheduledStartAt ?? null,
    scheduledEndAt: input.scheduledEndAt ?? null,
    expectedAmountInCents: parseMoney(input.expectedAmountInCents),
  };
}

function updateData(input: Partial<WorkOrderInput>): UpdateDraftData {
  return {
    ...(input.customerId === undefined ? {} : { customerId: input.customerId }),
    ...(input.locationId === undefined ? {} : { locationId: input.locationId }),
    ...(input.equipmentId === undefined
      ? {}
      : { equipmentId: input.equipmentId }),
    ...(input.serviceType === undefined
      ? {}
      : { serviceType: displayText(input.serviceType) }),
    ...(input.title === undefined
      ? {}
      : {
          title: displayText(input.title),
          normalizedTitle: normalizedText(input.title),
        }),
    ...(input.description === undefined
      ? {}
      : { description: displayText(input.description) }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    ...(input.scheduledStartAt === undefined
      ? {}
      : { scheduledStartAt: input.scheduledStartAt }),
    ...(input.scheduledEndAt === undefined
      ? {}
      : { scheduledEndAt: input.scheduledEndAt }),
    ...(input.expectedAmountInCents === undefined
      ? {}
      : { expectedAmountInCents: parseMoney(input.expectedAmountInCents) }),
  };
}

function parseMoney(value: string | null | undefined): bigint | null {
  const normalized = optionalText(value);
  return normalized === null ? null : BigInt(normalized);
}

function validateSchedule(start: Date | null, end: Date | null): void {
  if (start && end && end <= start) throw new WorkOrderScheduleInvalidError();
}

function validateRequiredSchedule(start: Date, end: Date): void {
  validateSchedule(start, end);
}

function validateDatePeriod(from: string, to: string): void {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end < start
  ) {
    throw new WorkOrderScheduleInvalidError();
  }
  const maximum = new Date(start);
  maximum.setUTCDate(maximum.getUTCDate() + 92);
  if (end > maximum) throw new WorkOrderScheduleInvalidError();
}

function resolveMutation(
  result:
    | Awaited<ReturnType<WorkOrderRepository['updateDraft']>>
    | Awaited<ReturnType<WorkOrderRepository['transition']>>,
): void {
  if (result.status === 'NOT_FOUND') throw new WorkOrderNotFoundError();
  if (result.status === 'VERSION_CONFLICT') {
    throw new WorkOrderVersionConflictError();
  }
  if (result.status === 'STATUS_LOCKED') throw new WorkOrderStatusLockedError();
}

function resolvePlanning(
  result: Awaited<ReturnType<WorkOrderRepository['schedule']>>,
): void {
  if (result.status === 'NOT_FOUND') throw new WorkOrderNotFoundError();
  if (result.status === 'STATUS_LOCKED') throw new WorkOrderStatusLockedError();
  if (result.status === 'VERSION_CONFLICT')
    throw new WorkOrderVersionConflictError();
  if (result.status === 'TECHNICIAN_INVALID')
    throw new WorkOrderTechnicianInvalidError();
  if (result.status === 'ASSIGNMENT_INVALID')
    throw new WorkOrderAssignmentInvalidError();
}

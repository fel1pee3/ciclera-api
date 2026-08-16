import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type {
  WorkOrderMutationContext,
  WorkOrderRepository,
  WorkOrderTransitionResult,
} from '../application/ports/work-order.repository';
import type { WorkOrder } from '../domain/work-order';
import { WorkOrderRelationInvalidError } from '../domain/work-order.errors';
import { transitionWorkOrderStatus } from '../domain/work-order-state-machine';

export const workOrderSelect = {
  id: true,
  number: true,
  customerId: true,
  locationId: true,
  equipmentId: true,
  serviceType: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  actualStartAt: true,
  actualEndAt: true,
  expectedAmountInCents: true,
  finalAmountInCents: true,
  version: true,
  createdByUserId: true,
  canceledByUserId: true,
  canceledAt: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaWorkOrderRepository implements WorkOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: Parameters<WorkOrderRepository['list']>[0]) {
    const parsedNumber = parseWorkOrderSearchNumber(input.search);
    const where: Prisma.WorkOrderWhereInput = {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.locationId ? { locationId: input.locationId } : {}),
      ...(input.equipmentId ? { equipmentId: input.equipmentId } : {}),
      ...(input.createdFrom || input.createdTo
        ? {
            createdAt: {
              ...(input.createdFrom ? { gte: input.createdFrom } : {}),
              ...(input.createdTo ? { lte: input.createdTo } : {}),
            },
          }
        : {}),
      ...(input.search
        ? {
            OR: [
              { normalizedTitle: { startsWith: input.search } },
              ...(parsedNumber === null ? [] : [{ number: parsedNumber }]),
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.workOrder.findMany({
        where,
        select: workOrderSelect,
        orderBy: orderBy(input.orderBy),
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.workOrder.count({ where }),
    ]);
    return {
      items: items.map(asDomain),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }

  async find(organizationId: string, workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { organizationId_id: { organizationId, id: workOrderId } },
      select: {
        ...workOrderSelect,
        statusHistory: {
          select: {
            id: true,
            previousStatus: true,
            newStatus: true,
            actorUserId: true,
            reason: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!workOrder) return null;
    const { statusHistory, ...record } = workOrder;
    return { ...asDomain(record), history: statusHistory };
  }

  createDraft(input: Parameters<WorkOrderRepository['createDraft']>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      if (!(await validRelations(transaction, input))) {
        throw new WorkOrderRelationInvalidError();
      }
      const counter = await transaction.workOrderCounter.upsert({
        where: { organizationId: input.organizationId },
        create: { organizationId: input.organizationId, lastNumber: 1n },
        update: { lastNumber: { increment: 1n } },
        select: { lastNumber: true },
      });
      const workOrder = await transaction.workOrder.create({
        data: {
          organizationId: input.organizationId,
          number: counter.lastNumber,
          customerId: input.customerId,
          locationId: input.locationId,
          equipmentId: input.equipmentId,
          serviceType: input.serviceType,
          title: input.title,
          normalizedTitle: input.normalizedTitle,
          description: input.description,
          priority: input.priority,
          scheduledStartAt: input.scheduledStartAt,
          scheduledEndAt: input.scheduledEndAt,
          expectedAmountInCents: input.expectedAmountInCents,
          createdByUserId: input.actorUserId,
        },
        select: workOrderSelect,
      });
      await transaction.workOrderStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          workOrderId: workOrder.id,
          previousStatus: null,
          newStatus: 'DRAFT',
          actorUserId: input.actorUserId,
          reason: 'WORK_ORDER_CREATED',
        },
      });
      await writeAudit(transaction, input, workOrder.id, 'WORK_ORDER_CREATED');
      return asDomain(workOrder);
    }, transactionOptions);
  }

  updateDraft(input: Parameters<WorkOrderRepository['updateDraft']>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.workOrder.findUnique({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.workOrderId,
          },
        },
        select: {
          status: true,
          version: true,
          customerId: true,
          locationId: true,
          equipmentId: true,
        },
      });
      if (!current) return { status: 'NOT_FOUND' } as const;
      if (current.status !== 'DRAFT')
        return { status: 'STATUS_LOCKED' } as const;
      if (current.version !== input.expectedVersion) {
        return { status: 'VERSION_CONFLICT' } as const;
      }
      const relation = {
        organizationId: input.organizationId,
        customerId: input.customerId ?? current.customerId,
        locationId: input.locationId ?? current.locationId,
        equipmentId:
          input.equipmentId === undefined
            ? current.equipmentId
            : input.equipmentId,
      };
      if (!(await validRelations(transaction, relation))) {
        throw new WorkOrderRelationInvalidError();
      }
      const updated = await transaction.workOrder.updateMany({
        where: {
          organizationId: input.organizationId,
          id: input.workOrderId,
          status: 'DRAFT',
          version: input.expectedVersion,
        },
        data: {
          ...(input.customerId === undefined
            ? {}
            : { customerId: input.customerId }),
          ...(input.locationId === undefined
            ? {}
            : { locationId: input.locationId }),
          ...(input.equipmentId === undefined
            ? {}
            : { equipmentId: input.equipmentId }),
          ...(input.serviceType === undefined
            ? {}
            : { serviceType: input.serviceType }),
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.normalizedTitle === undefined
            ? {}
            : { normalizedTitle: input.normalizedTitle }),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.priority === undefined ? {} : { priority: input.priority }),
          ...(input.scheduledStartAt === undefined
            ? {}
            : { scheduledStartAt: input.scheduledStartAt }),
          ...(input.scheduledEndAt === undefined
            ? {}
            : { scheduledEndAt: input.scheduledEndAt }),
          ...(input.expectedAmountInCents === undefined
            ? {}
            : { expectedAmountInCents: input.expectedAmountInCents }),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return { status: 'VERSION_CONFLICT' } as const;
      await writeAudit(
        transaction,
        input,
        input.workOrderId,
        'WORK_ORDER_UPDATED',
      );
      const workOrder = await transaction.workOrder.findUniqueOrThrow({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.workOrderId,
          },
        },
        select: workOrderSelect,
      });
      return { status: 'SUCCESS', workOrder: asDomain(workOrder) } as const;
    }, transactionOptions);
  }

  transition(
    input: Parameters<WorkOrderRepository['transition']>[0],
  ): Promise<WorkOrderTransitionResult> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.workOrder.findUnique({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.workOrderId,
          },
        },
        select: { status: true, version: true },
      });
      if (!current) return { status: 'NOT_FOUND' };
      if (current.version !== input.expectedVersion) {
        return { status: 'VERSION_CONFLICT' };
      }
      const nextStatus = transitionWorkOrderStatus(
        current.status,
        input.action,
      );
      const transitioned = await transaction.workOrder.updateMany({
        where: {
          organizationId: input.organizationId,
          id: input.workOrderId,
          status: current.status,
          version: input.expectedVersion,
        },
        data: {
          status: nextStatus,
          version: { increment: 1 },
          ...(input.action === 'CANCEL'
            ? {
                canceledAt: new Date(),
                canceledByUserId: input.actorUserId,
                cancellationReason: input.reason ?? null,
              }
            : {}),
        },
      });
      if (transitioned.count !== 1) return { status: 'VERSION_CONFLICT' };
      await transaction.workOrderStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          previousStatus: current.status,
          newStatus: nextStatus,
          actorUserId: input.actorUserId,
          reason: input.reason ?? null,
        },
      });
      await writeAudit(
        transaction,
        input,
        input.workOrderId,
        `WORK_ORDER_${input.action}`,
      );
      const workOrder = await transaction.workOrder.findUniqueOrThrow({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.workOrderId,
          },
        },
        select: workOrderSelect,
      });
      return { status: 'SUCCESS', workOrder: asDomain(workOrder) };
    }, transactionOptions);
  }
}

const transactionOptions = { maxWait: 10_000, timeout: 10_000 } as const;

function parseWorkOrderSearchNumber(search?: string): bigint | null {
  if (!search) return null;
  const digits = search.toUpperCase().replace(/^OS-/, '');
  if (!/^\d+$/.test(digits)) return null;
  const value = BigInt(digits);
  return value <= 9_223_372_036_854_775_807n ? value : null;
}

function orderBy(
  value: Parameters<WorkOrderRepository['list']>[0]['orderBy'],
): Prisma.WorkOrderOrderByWithRelationInput[] {
  const options: Record<
    typeof value,
    Prisma.WorkOrderOrderByWithRelationInput[]
  > = {
    CREATED_AT_DESC: [{ createdAt: 'desc' }, { id: 'asc' }],
    CREATED_AT_ASC: [{ createdAt: 'asc' }, { id: 'asc' }],
    NUMBER_DESC: [{ number: 'desc' }],
    NUMBER_ASC: [{ number: 'asc' }],
    SCHEDULED_START_ASC: [
      { scheduledStartAt: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ],
  };
  return options[value];
}

async function validRelations(
  transaction: Prisma.TransactionClient,
  input: {
    organizationId: string;
    customerId: string;
    locationId: string;
    equipmentId: string | null;
  },
) {
  const location = await transaction.serviceLocation.findUnique({
    where: {
      organizationId_customerId_id: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        id: input.locationId,
      },
    },
    select: { status: true, customer: { select: { archivedAt: true } } },
  });
  if (
    !location ||
    location.status !== 'ACTIVE' ||
    location.customer.archivedAt
  ) {
    return false;
  }
  if (!input.equipmentId) return true;
  const equipment = await transaction.equipment.findUnique({
    where: {
      organizationId_customerId_locationId_id: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        locationId: input.locationId,
        id: input.equipmentId,
      },
    },
    select: { archivedAt: true },
  });
  return Boolean(equipment && !equipment.archivedAt);
}

function asDomain(
  value: Prisma.WorkOrderGetPayload<{ select: typeof workOrderSelect }>,
): WorkOrder {
  return value;
}

function writeAudit(
  transaction: Prisma.TransactionClient,
  context: WorkOrderMutationContext,
  resourceId: string,
  action: string,
) {
  return transaction.auditLog.create({
    data: {
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action,
      resourceType: 'WORK_ORDER',
      resourceId,
    },
  });
}

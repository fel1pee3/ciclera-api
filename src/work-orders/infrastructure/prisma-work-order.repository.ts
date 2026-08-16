import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type {
  WorkOrderMutationContext,
  WorkOrderRepository,
  WorkOrderTransitionResult,
} from '../application/ports/work-order.repository';
import type { WorkOrder } from '../domain/work-order';
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

  createDraft(input: Parameters<WorkOrderRepository['createDraft']>[0]) {
    return this.prisma.$transaction(async (transaction) => {
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

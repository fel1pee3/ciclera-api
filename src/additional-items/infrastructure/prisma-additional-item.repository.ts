import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type { AdditionalItemRepository } from '../application/ports/additional-item.repository';

@Injectable()
export class PrismaAdditionalItemRepository implements AdditionalItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: Parameters<AdditionalItemRepository['create']>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const execution = await editableExecution(transaction, input);
      const status = validateExecution(execution, input.expectedVersion);
      if (status) return status;
      if (!(await bumpExecution(transaction, execution!.id, input))) {
        return { status: 'VERSION_CONFLICT' } as const;
      }
      const item = await transaction.additionalItem.create({
        data: {
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          executionId: execution!.id,
          type: input.type,
          description: input.description,
          quantityInThousand: input.quantityInThousand,
          unitAmountInCents: input.unitAmountInCents,
          totalAmountInCents: input.totalAmountInCents,
          createdByUserId: input.technicianId,
          updatedByUserId: input.technicianId,
        },
      });
      await audit(transaction, input, 'ADDITIONAL_ITEM_CREATED', item.id);
      return { status: 'SUCCESS' } as const;
    }, transactionOptions);
  }

  update(input: Parameters<AdditionalItemRepository['update']>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const execution = await editableExecution(transaction, input);
      const status = validateExecution(execution, input.expectedVersion);
      if (status) return status;
      const item = await transaction.additionalItem.findFirst({
        where: {
          id: input.itemId,
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          executionId: execution!.id,
        },
        select: { id: true },
      });
      if (!item) return { status: 'NOT_FOUND' } as const;
      if (!(await bumpExecution(transaction, execution!.id, input))) {
        return { status: 'VERSION_CONFLICT' } as const;
      }
      await transaction.additionalItem.update({
        where: { id: item.id },
        data: {
          type: input.type,
          description: input.description,
          quantityInThousand: input.quantityInThousand,
          unitAmountInCents: input.unitAmountInCents,
          totalAmountInCents: input.totalAmountInCents,
          updatedByUserId: input.technicianId,
        },
      });
      await audit(transaction, input, 'ADDITIONAL_ITEM_UPDATED', item.id);
      return { status: 'SUCCESS' } as const;
    }, transactionOptions);
  }

  remove(input: Parameters<AdditionalItemRepository['remove']>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const execution = await editableExecution(transaction, input);
      const status = validateExecution(execution, input.expectedVersion);
      if (status) return status;
      const item = await transaction.additionalItem.findFirst({
        where: {
          id: input.itemId,
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          executionId: execution!.id,
        },
        select: { id: true },
      });
      if (!item) return { status: 'NOT_FOUND' } as const;
      if (!(await bumpExecution(transaction, execution!.id, input))) {
        return { status: 'VERSION_CONFLICT' } as const;
      }
      await transaction.additionalItem.delete({ where: { id: item.id } });
      await audit(transaction, input, 'ADDITIONAL_ITEM_REMOVED', item.id);
      return { status: 'SUCCESS' } as const;
    }, transactionOptions);
  }
}

const transactionOptions = { maxWait: 10_000, timeout: 10_000 } as const;

type EditableExecution = Awaited<ReturnType<typeof editableExecution>>;

function editableExecution(
  transaction: Prisma.TransactionClient,
  input: { organizationId: string; technicianId: string; workOrderId: string },
) {
  return transaction.workOrderExecution
    .findFirst({
      where: {
        organizationId: input.organizationId,
        workOrderId: input.workOrderId,
        technicianId: input.technicianId,
        workOrder: {
          assignments: {
            some: { technicianId: input.technicianId, unassignedAt: null },
          },
        },
      },
      select: {
        id: true,
        version: true,
        workOrder: { select: { status: true } },
      },
    })
    .then((record) =>
      record ? { ...record, status: record.workOrder.status } : null,
    );
}

function validateExecution(
  execution: EditableExecution,
  expectedVersion: number,
) {
  if (!execution) return { status: 'NOT_FOUND' } as const;
  if (execution.status !== 'IN_PROGRESS')
    return { status: 'STATUS_LOCKED' } as const;
  if (execution.version !== expectedVersion)
    return { status: 'VERSION_CONFLICT' } as const;
  return null;
}

function bumpExecution(
  transaction: Prisma.TransactionClient,
  executionId: string,
  input: { organizationId: string; expectedVersion: number },
) {
  return transaction.workOrderExecution
    .updateMany({
      where: {
        id: executionId,
        organizationId: input.organizationId,
        version: input.expectedVersion,
      },
      data: { version: { increment: 1 } },
    })
    .then((result) => result.count === 1);
}

function audit(
  transaction: Prisma.TransactionClient,
  input: { organizationId: string; technicianId: string; requestId: string },
  action: string,
  itemId: string,
) {
  return transaction.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.technicianId,
      requestId: input.requestId,
      action,
      resourceType: 'ADDITIONAL_ITEM',
      resourceId: itemId,
    },
  });
}

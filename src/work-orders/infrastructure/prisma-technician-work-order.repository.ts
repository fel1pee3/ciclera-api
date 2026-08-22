import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type {
  TechnicianWorkOrderRepository,
  TechnicianWorkOrderView,
  TechnicianWorkOrder,
} from '../application/ports/technician-work-order.repository';
import { transitionWorkOrderStatus } from '../domain/work-order-state-machine';

const technicianWorkOrderSelect = {
  id: true,
  number: true,
  customer: { select: { id: true, name: true } },
  location: {
    select: {
      id: true,
      name: true,
      street: true,
      number: true,
      complement: true,
      neighborhood: true,
      city: true,
      state: true,
    },
  },
  equipment: { select: { id: true, name: true, identifier: true } },
  serviceType: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  actualStartAt: true,
  actualEndAt: true,
  version: true,
  execution: {
    select: {
      id: true,
      technicianId: true,
      notes: true,
      version: true,
      startedAt: true,
      updatedAt: true,
      evidence: {
        where: { status: 'AVAILABLE' },
        select: {
          id: true,
          fileName: true,
          contentType: true,
          sizeBytes: true,
          confirmedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      additionalItems: {
        select: {
          id: true,
          type: true,
          description: true,
          quantityInThousand: true,
          unitAmountInCents: true,
          totalAmountInCents: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  },
  reviews: {
    where: { decision: 'CORRECTION_REQUESTED' },
    select: {
      id: true,
      reason: true,
      description: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
} as const;

@Injectable()
export class PrismaTechnicianWorkOrderRepository implements TechnicianWorkOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: Parameters<TechnicianWorkOrderRepository['list']>[0]) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { timezone: true },
    });
    const timezone = organization?.timezone ?? 'UTC';
    const where: Prisma.WorkOrderWhereInput = {
      organizationId: input.organizationId,
      assignments: {
        some: { technicianId: input.technicianId, unassignedAt: null },
      },
      ...viewWhere(input.view, timezone),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.workOrder.findMany({
        where,
        select: technicianWorkOrderSelect,
        orderBy: [
          { scheduledStartAt: { sort: 'asc', nulls: 'last' } },
          { id: 'asc' },
        ],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.workOrder.count({ where }),
    ]);
    return {
      items: items.map(mapTechnicianWorkOrder),
      total,
      page: input.page,
      pageSize: input.pageSize,
      timezone,
    };
  }

  async find(
    organizationId: string,
    technicianId: string,
    workOrderId: string,
  ) {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: {
        id: workOrderId,
        organizationId,
        assignments: { some: { technicianId, unassignedAt: null } },
      },
      select: technicianWorkOrderSelect,
    });
    return workOrder ? mapTechnicianWorkOrder(workOrder) : null;
  }

  startExecution(
    input: Parameters<TechnicianWorkOrderRepository['startExecution']>[0],
  ) {
    return this.prisma
      .$transaction(async (transaction) => {
        const current = await transaction.workOrder.findFirst({
          where: {
            id: input.workOrderId,
            organizationId: input.organizationId,
            assignments: {
              some: { technicianId: input.technicianId, unassignedAt: null },
            },
          },
          select: {
            status: true,
            version: true,
            execution: { select: { id: true } },
          },
        });
        if (!current) return { status: 'NOT_FOUND' } as const;
        if (current.execution) return { status: 'EXECUTION_EXISTS' } as const;
        if (current.status !== 'SCHEDULED') {
          return { status: 'STATUS_LOCKED' } as const;
        }
        if (current.version !== input.expectedVersion) {
          return { status: 'VERSION_CONFLICT' } as const;
        }
        const nextStatus = transitionWorkOrderStatus(current.status, 'START');
        const now = new Date();
        const updated = await transaction.workOrder.updateMany({
          where: {
            id: input.workOrderId,
            organizationId: input.organizationId,
            status: current.status,
            version: input.expectedVersion,
          },
          data: {
            status: nextStatus,
            actualStartAt: now,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          return { status: 'VERSION_CONFLICT' } as const;
        }
        await transaction.workOrderExecution.create({
          data: {
            organizationId: input.organizationId,
            workOrderId: input.workOrderId,
            technicianId: input.technicianId,
            startedAt: now,
          },
        });
        await transaction.workOrderStatusHistory.create({
          data: {
            organizationId: input.organizationId,
            workOrderId: input.workOrderId,
            previousStatus: current.status,
            newStatus: nextStatus,
            actorUserId: input.technicianId,
            reason: 'WORK_ORDER_STARTED',
          },
        });
        await writeExecutionAudit(transaction, input, 'WORK_ORDER_STARTED');
        return { status: 'SUCCESS' } as const;
      }, executionTransactionOptions)
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return { status: 'VERSION_CONFLICT' } as const;
        }
        throw error;
      });
  }

  updateExecution(
    input: Parameters<TechnicianWorkOrderRepository['updateExecution']>[0],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.workOrder.findFirst({
        where: {
          id: input.workOrderId,
          organizationId: input.organizationId,
          assignments: {
            some: { technicianId: input.technicianId, unassignedAt: null },
          },
        },
        select: {
          status: true,
          execution: {
            select: { id: true, version: true, technicianId: true },
          },
        },
      });
      if (!current) return { status: 'NOT_FOUND' } as const;
      if (current.status !== 'IN_PROGRESS') {
        return { status: 'STATUS_LOCKED' } as const;
      }
      if (!current.execution) return { status: 'EXECUTION_NOT_FOUND' } as const;
      if (current.execution.version !== input.expectedVersion) {
        return { status: 'VERSION_CONFLICT' } as const;
      }
      const updated = await transaction.workOrderExecution.updateMany({
        where: {
          id: current.execution.id,
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          technicianId: input.technicianId,
          version: input.expectedVersion,
        },
        data: { notes: input.notes, version: { increment: 1 } },
      });
      if (updated.count !== 1) return { status: 'VERSION_CONFLICT' } as const;
      await writeExecutionAudit(
        transaction,
        input,
        'WORK_ORDER_EXECUTION_UPDATED',
      );
      return { status: 'SUCCESS' } as const;
    }, executionTransactionOptions);
  }

  submitForReview(
    input: Parameters<TechnicianWorkOrderRepository['submitForReview']>[0],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.workOrder.findFirst({
        where: {
          id: input.workOrderId,
          organizationId: input.organizationId,
          assignments: {
            some: { technicianId: input.technicianId, unassignedAt: null },
          },
        },
        select: {
          status: true,
          version: true,
          execution: {
            select: {
              id: true,
              version: true,
            },
          },
        },
      });
      if (!current) return { status: 'NOT_FOUND' } as const;
      if (current.status === 'AWAITING_REVIEW') {
        return { status: 'ALREADY_SUBMITTED' } as const;
      }
      if (current.status !== 'IN_PROGRESS') {
        return { status: 'STATUS_LOCKED' } as const;
      }
      if (!current.execution) return { status: 'EXECUTION_NOT_FOUND' } as const;
      if (current.execution.version !== input.expectedVersion) {
        return { status: 'VERSION_CONFLICT' } as const;
      }
      const lockedExecution = await transaction.workOrderExecution.updateMany({
        where: {
          id: current.execution.id,
          organizationId: input.organizationId,
          technicianId: input.technicianId,
          version: input.expectedVersion,
        },
        data: { version: { increment: 1 } },
      });
      if (lockedExecution.count !== 1) {
        return { status: 'VERSION_CONFLICT' } as const;
      }
      const transitioned = await transaction.workOrder.updateMany({
        where: {
          id: input.workOrderId,
          organizationId: input.organizationId,
          status: 'IN_PROGRESS',
          version: current.version,
        },
        data: {
          status: 'AWAITING_REVIEW',
          actualEndAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (transitioned.count !== 1) {
        return { status: 'VERSION_CONFLICT' } as const;
      }
      await transaction.workOrderStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          previousStatus: 'IN_PROGRESS',
          newStatus: 'AWAITING_REVIEW',
          actorUserId: input.technicianId,
          reason: 'SUBMITTED_FOR_REVIEW',
        },
      });
      await writeExecutionAudit(
        transaction,
        input,
        'WORK_ORDER_SUBMITTED_FOR_REVIEW',
      );
      return { status: 'SUCCESS' } as const;
    }, executionTransactionOptions);
  }

  resumeCorrection(
    input: Parameters<TechnicianWorkOrderRepository['resumeCorrection']>[0],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.workOrder.findFirst({
        where: {
          id: input.workOrderId,
          organizationId: input.organizationId,
          assignments: {
            some: { technicianId: input.technicianId, unassignedAt: null },
          },
        },
        select: {
          status: true,
          version: true,
          execution: { select: { id: true } },
        },
      });
      if (!current) return { status: 'NOT_FOUND' } as const;
      if (current.status === 'IN_PROGRESS') {
        return { status: 'ALREADY_RESUMED' } as const;
      }
      if (current.status !== 'PENDING_CORRECTION' || !current.execution) {
        return { status: 'STATUS_LOCKED' } as const;
      }
      if (current.version !== input.expectedVersion) {
        return { status: 'VERSION_CONFLICT' } as const;
      }
      const updated = await transaction.workOrder.updateMany({
        where: {
          id: input.workOrderId,
          organizationId: input.organizationId,
          status: 'PENDING_CORRECTION',
          version: input.expectedVersion,
        },
        data: {
          status: 'IN_PROGRESS',
          actualEndAt: null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return { status: 'VERSION_CONFLICT' } as const;
      await transaction.workOrderStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          previousStatus: 'PENDING_CORRECTION',
          newStatus: 'IN_PROGRESS',
          actorUserId: input.technicianId,
          reason: 'CORRECTION_RESUMED',
        },
      });
      await writeExecutionAudit(
        transaction,
        input,
        'WORK_ORDER_CORRECTION_RESUMED',
      );
      return { status: 'SUCCESS' } as const;
    }, executionTransactionOptions);
  }
}

const executionTransactionOptions = {
  maxWait: 10_000,
  timeout: 10_000,
} as const;

function writeExecutionAudit(
  transaction: Prisma.TransactionClient,
  input: {
    organizationId: string;
    technicianId: string;
    workOrderId: string;
    requestId: string;
  },
  action: string,
) {
  return transaction.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.technicianId,
      requestId: input.requestId,
      action,
      resourceType: 'WORK_ORDER',
      resourceId: input.workOrderId,
    },
  });
}

function viewWhere(
  view: TechnicianWorkOrderView | undefined,
  timezone: string,
): Prisma.WorkOrderWhereInput {
  if (view === 'IN_PROGRESS') return { status: 'IN_PROGRESS' };
  if (view === 'PENDING') return { status: 'PENDING_CORRECTION' };
  if (view === 'TODAY' || view === 'UPCOMING') {
    const today = dateInTimezone(new Date(), timezone);
    const tomorrow = addDays(today, 1);
    return view === 'TODAY'
      ? {
          status: { in: ['SCHEDULED', 'IN_PROGRESS', 'PENDING_CORRECTION'] },
          scheduledStartAt: {
            gte: zonedMidnightToUtc(today, timezone),
            lt: zonedMidnightToUtc(tomorrow, timezone),
          },
        }
      : {
          status: 'SCHEDULED',
          scheduledStartAt: {
            gte: zonedMidnightToUtc(tomorrow, timezone),
          },
        };
  }
  return {
    status: { in: ['SCHEDULED', 'IN_PROGRESS', 'PENDING_CORRECTION'] },
  };
}

function dateInTimezone(value: Date, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function zonedMidnightToUtc(date: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  let instant = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .map((part) => [part.type, part.value]),
    );
    const rendered = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    instant += Date.UTC(year, month - 1, day) - rendered;
  }
  return new Date(instant);
}

function mapTechnicianWorkOrder(
  workOrder: Prisma.WorkOrderGetPayload<{
    select: typeof technicianWorkOrderSelect;
  }>,
): TechnicianWorkOrder {
  const { reviews, ...order } = workOrder;
  const currentCorrection =
    reviews[0]?.reason && reviews[0].description
      ? {
          id: reviews[0].id,
          reason: reviews[0].reason,
          description: reviews[0].description,
          requestedAt: reviews[0].createdAt,
        }
      : null;
  if (!order.execution) {
    return { ...order, execution: null, currentCorrection };
  }
  const { evidence, additionalItems, ...execution } = order.execution;
  return {
    ...order,
    currentCorrection,
    execution: {
      ...execution,
      evidence: evidence.map((item) => ({
        ...item,
        confirmedAt: item.confirmedAt as Date,
      })),
      additionalItems,
      additionalTotalInCents: additionalItems.reduce(
        (total, item) => total + item.totalAmountInCents,
        0n,
      ),
    },
  };
}

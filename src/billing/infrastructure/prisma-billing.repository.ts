import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type {
  BillingReadyQuery,
  BillingRepository,
} from '../application/ports/billing.repository';

@Injectable()
export class PrismaBillingRepository implements BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listReady(input: Parameters<BillingRepository['listReady']>[0]) {
    const where = buildReadyWhere(input);
    const [records, total, amount] = await this.prisma.$transaction([
      this.prisma.workOrder.findMany({
        where,
        select: {
          id: true,
          number: true,
          title: true,
          customer: { select: { id: true, name: true } },
          actualEndAt: true,
          finalAmountInCents: true,
          version: true,
          reviews: {
            where: { decision: 'APPROVED' },
            select: { createdAt: true },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
          },
        },
        orderBy: [{ actualEndAt: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.workOrder.count({ where }),
      this.prisma.workOrder.aggregate({
        where,
        _sum: { finalAmountInCents: true },
      }),
    ]);
    return {
      items: records.flatMap((record) => {
        const approvedAt = record.reviews[0]?.createdAt;
        if (!record.actualEndAt || !record.finalAmountInCents || !approvedAt) {
          return [];
        }
        return [
          {
            id: record.id,
            number: record.number,
            title: record.title,
            customer: record.customer,
            actualEndAt: record.actualEndAt,
            approvedAt,
            finalAmountInCents: record.finalAmountInCents,
            version: record.version,
          },
        ];
      }),
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalAmountInCents: amount._sum.finalAmountInCents ?? 0n,
    };
  }

  async exportReady(input: Parameters<BillingRepository['exportReady']>[0]) {
    const records = await this.prisma.workOrder.findMany({
      where: buildReadyWhere(input),
      select: {
        id: true,
        number: true,
        title: true,
        serviceType: true,
        customer: { select: { id: true, name: true, document: true } },
        actualEndAt: true,
        finalAmountInCents: true,
        version: true,
        reviews: {
          where: { decision: 'APPROVED' },
          select: { createdAt: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
      orderBy: [{ actualEndAt: 'asc' }, { id: 'asc' }],
      take: input.limit,
    });
    return records.flatMap((record) => {
      const approvedAt = record.reviews[0]?.createdAt;
      if (!record.actualEndAt || !record.finalAmountInCents || !approvedAt) {
        return [];
      }
      return [
        {
          id: record.id,
          number: record.number,
          title: record.title,
          serviceType: record.serviceType,
          customer: { id: record.customer.id, name: record.customer.name },
          customerDocument: record.customer.document,
          actualEndAt: record.actualEndAt,
          approvedAt,
          finalAmountInCents: record.finalAmountInCents,
          version: record.version,
        },
      ];
    });
  }

  markBilled(input: Parameters<BillingRepository['markBilled']>[0]) {
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
          billedAt: true,
          billedByUserId: true,
        },
      });
      if (!current) return { status: 'NOT_FOUND' } as const;
      if (
        current.status === 'BILLED' &&
        current.billedAt &&
        current.billedByUserId
      ) {
        return {
          status: 'ALREADY_BILLED',
          billedAt: current.billedAt,
          billedByUserId: current.billedByUserId,
        } as const;
      }
      if (current.status !== 'READY_TO_BILL') {
        return { status: 'STATUS_LOCKED' } as const;
      }
      if (current.version !== input.expectedVersion) {
        return { status: 'VERSION_CONFLICT' } as const;
      }
      const billedAt = new Date();
      const updated = await transaction.workOrder.updateMany({
        where: {
          id: input.workOrderId,
          organizationId: input.organizationId,
          status: 'READY_TO_BILL',
          version: input.expectedVersion,
        },
        data: {
          status: 'BILLED',
          billedAt,
          billedByUserId: input.actorUserId,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        return { status: 'VERSION_CONFLICT' } as const;
      }
      await transaction.workOrderStatusHistory.create({
        data: {
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          previousStatus: 'READY_TO_BILL',
          newStatus: 'BILLED',
          actorUserId: input.actorUserId,
          reason: 'WORK_ORDER_BILLED',
        },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          requestId: input.requestId,
          action: 'WORK_ORDER_BILLED',
          resourceType: 'WORK_ORDER',
          resourceId: input.workOrderId,
        },
      });
      return {
        status: 'SUCCESS',
        billedAt,
        billedByUserId: input.actorUserId,
      } as const;
    });
  }
}

function buildReadyWhere(
  input: Omit<BillingReadyQuery, 'page' | 'pageSize'>,
): Prisma.WorkOrderWhereInput {
  const actualEndAt: Prisma.DateTimeNullableFilter = {};
  if (input.completedFrom) actualEndAt.gte = input.completedFrom;
  let completedTo = input.completedTo;
  if (input.minimumAgingDays !== undefined) {
    const agingLimit = new Date(
      Date.now() - input.minimumAgingDays * 24 * 60 * 60 * 1000,
    );
    if (!completedTo || agingLimit < completedTo) completedTo = agingLimit;
  }
  if (completedTo) actualEndAt.lte = completedTo;
  const finalAmountInCents: Prisma.BigIntNullableFilter = {};
  if (input.minimumAmountInCents !== undefined) {
    finalAmountInCents.gte = input.minimumAmountInCents;
  }
  if (input.maximumAmountInCents !== undefined) {
    finalAmountInCents.lte = input.maximumAmountInCents;
  }
  return {
    organizationId: input.organizationId,
    status: 'READY_TO_BILL',
    customerId: input.customerId,
    actualEndAt: Object.keys(actualEndAt).length ? actualEndAt : undefined,
    finalAmountInCents: Object.keys(finalAmountInCents).length
      ? finalAmountInCents
      : undefined,
  };
}

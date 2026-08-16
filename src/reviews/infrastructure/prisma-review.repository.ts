import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  missingRequiredFieldIds,
  type ChecklistAnswer,
  type ChecklistSnapshot,
} from '../../checklists/domain/checklist';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type { ReviewRepository } from '../application/ports/review.repository';

const queueSelect = {
  id: true,
  number: true,
  title: true,
  priority: true,
  customer: { select: { id: true, name: true } },
  expectedAmountInCents: true,
  actualEndAt: true,
  version: true,
  additionalItems: { select: { totalAmountInCents: true } },
} as const;

@Injectable()
export class PrismaReviewRepository implements ReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: Parameters<ReviewRepository['list']>[0]) {
    const where: Prisma.WorkOrderWhereInput = {
      organizationId: input.organizationId,
      status: 'AWAITING_REVIEW',
    };
    const orderBy: Prisma.WorkOrderOrderByWithRelationInput[] =
      input.orderBy === 'EXPECTED_AMOUNT_DESC'
        ? [
            { expectedAmountInCents: { sort: 'desc', nulls: 'last' } },
            { id: 'asc' },
          ]
        : [{ actualEndAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.workOrder.findMany({
        where,
        select: queueSelect,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.workOrder.count({ where }),
    ]);
    return {
      items: items.map(mapQueueItem),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }

  async find(organizationId: string, workOrderId: string) {
    const record = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, organizationId, status: 'AWAITING_REVIEW' },
      select: {
        ...queueSelect,
        description: true,
        serviceType: true,
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
        execution: {
          select: {
            id: true,
            notes: true,
            startedAt: true,
            updatedAt: true,
            checklistSnapshot: true,
            checklistResponses: {
              select: { fieldId: true, value: true },
              orderBy: { fieldId: 'asc' },
            },
            evidence: {
              where: { status: 'AVAILABLE' },
              select: {
                id: true,
                kind: true,
                fileName: true,
                contentType: true,
                sizeBytes: true,
                confirmedAt: true,
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
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
    if (!record?.execution) return null;
    const { location, execution, ...queue } = record;
    const snapshot =
      execution.checklistSnapshot as unknown as ChecklistSnapshot | null;
    const responses = execution.checklistResponses.map((item) => ({
      fieldId: item.fieldId,
      value: item.value as ChecklistAnswer['value'],
    }));
    return {
      ...mapQueueItem(queue),
      description: record.description,
      serviceType: record.serviceType,
      location: {
        id: location.id,
        name: location.name,
        address: [
          `${location.street}, ${location.number}`,
          location.complement,
          location.neighborhood,
          `${location.city}/${location.state}`,
        ]
          .filter(Boolean)
          .join(' · '),
      },
      equipment: record.equipment,
      execution: {
        id: execution.id,
        notes: execution.notes,
        startedAt: execution.startedAt,
        updatedAt: execution.updatedAt,
        checklist: snapshot
          ? {
              snapshot,
              responses,
              missingRequiredFieldIds: missingRequiredFieldIds(
                snapshot,
                responses,
              ),
            }
          : null,
        evidence: execution.evidence.map((item) => ({
          ...item,
          confirmedAt: item.confirmedAt as Date,
        })),
        additionalItems: execution.additionalItems,
      },
    };
  }
}

function mapQueueItem(
  record: Prisma.WorkOrderGetPayload<{ select: typeof queueSelect }>,
) {
  const waitingSince = record.actualEndAt ?? new Date();
  return {
    id: record.id,
    number: record.number,
    title: record.title,
    priority: record.priority,
    customer: record.customer,
    expectedAmountInCents: record.expectedAmountInCents,
    additionalTotalInCents: record.additionalItems.reduce(
      (total, item) => total + item.totalAmountInCents,
      0n,
    ),
    waitingSince,
    agingSeconds: Math.max(
      0,
      Math.floor((Date.now() - waitingSince.getTime()) / 1000),
    ),
    version: record.version,
  };
}

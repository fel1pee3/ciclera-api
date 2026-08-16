import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type {
  HistoryRepository,
  TimelineEntry,
} from '../application/ports/history.repository';

const safeMetadataKeys = new Set(['reason', 'finalAmountInCents']);

@Injectable()
export class PrismaHistoryRepository implements HistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(input: Parameters<HistoryRepository['find']>[0]) {
    const order = await this.prisma.workOrder.findUnique({
      where: {
        organizationId_id: {
          organizationId: input.organizationId,
          id: input.workOrderId,
        },
      },
      select: {
        id: true,
        billedAt: true,
        billedBy: { select: { id: true, name: true } },
        statusHistory: {
          select: {
            id: true,
            previousStatus: true,
            newStatus: true,
            reason: true,
            createdAt: true,
            actor: { select: { id: true, name: true } },
          },
        },
        assignments: {
          select: {
            id: true,
            assignedAt: true,
            unassignedAt: true,
            assignedBy: { select: { id: true, name: true } },
            unassignedBy: { select: { id: true, name: true } },
            technician: { select: { id: true, name: true } },
          },
        },
        reviews: {
          select: {
            id: true,
            decision: true,
            reason: true,
            description: true,
            createdAt: true,
            actor: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!order) return null;
    const audit = await this.prisma.auditLog.findMany({
      where: {
        organizationId: input.organizationId,
        resourceType: 'WORK_ORDER',
        resourceId: input.workOrderId,
      },
      select: {
        id: true,
        action: true,
        requestId: true,
        metadata: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const timeline: TimelineEntry[] = [];
    for (const status of order.statusHistory) {
      if (status.newStatus === 'BILLED') continue;
      timeline.push({
        id: `status:${status.id}`,
        type: 'STATUS',
        occurredAt: status.createdAt,
        actor: status.actor,
        previousStatus: status.previousStatus,
        newStatus: status.newStatus,
        reason: status.reason,
      });
    }
    for (const assignment of order.assignments) {
      timeline.push({
        id: `assignment:${assignment.id}:assigned`,
        type: 'ASSIGNMENT',
        occurredAt: assignment.assignedAt,
        actor: assignment.assignedBy,
        technician: assignment.technician,
        action: 'ASSIGNED',
      });
      if (assignment.unassignedAt && assignment.unassignedBy) {
        timeline.push({
          id: `assignment:${assignment.id}:unassigned`,
          type: 'ASSIGNMENT',
          occurredAt: assignment.unassignedAt,
          actor: assignment.unassignedBy,
          technician: assignment.technician,
          action: 'UNASSIGNED',
        });
      }
    }
    for (const review of order.reviews) {
      timeline.push({
        id: `review:${review.id}`,
        type: 'REVIEW',
        occurredAt: review.createdAt,
        actor: review.actor,
        decision: review.decision,
        reason: review.reason,
        description: review.description,
      });
    }
    if (order.billedAt && order.billedBy) {
      timeline.push({
        id: `billing:${order.id}`,
        type: 'BILLING',
        occurredAt: order.billedAt,
        actor: order.billedBy,
        action: 'BILLED',
      });
    }
    timeline.sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    );
    return {
      timeline,
      audit: audit.map((entry) => ({
        id: entry.id,
        action: entry.action,
        actor: entry.actor,
        requestId: entry.requestId,
        metadata: safeMetadata(entry.metadata),
        occurredAt: entry.createdAt,
      })),
    };
  }
}

function safeMetadata(
  value: Prisma.JsonValue | null,
): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const safeEntries = Object.entries(value).flatMap(([key, item]) =>
    safeMetadataKeys.has(key) &&
    (typeof item === 'string' || typeof item === 'number')
      ? [[key, String(item)] as const]
      : [],
  );
  return safeEntries.length ? Object.fromEntries(safeEntries) : null;
}

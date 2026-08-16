import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type { EvidenceRepository } from '../application/ports/evidence.repository';

@Injectable()
export class PrismaEvidenceRepository implements EvidenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  createIntent(input: Parameters<EvidenceRepository['createIntent']>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const execution = await editableExecution(transaction, input);
      if (!execution) return { status: 'NOT_FOUND' } as const;
      if (execution.status !== 'IN_PROGRESS')
        return { status: 'STATUS_LOCKED' } as const;
      if (execution.version !== input.expectedVersion)
        return { status: 'VERSION_CONFLICT' } as const;
      const count = await transaction.evidence.count({
        where: {
          organizationId: input.organizationId,
          executionId: execution.id,
        },
      });
      if (count >= input.maxFiles) return { status: 'LIMIT_EXCEEDED' } as const;
      const version = await bumpExecution(transaction, execution.id, input);
      if (!version) return { status: 'VERSION_CONFLICT' } as const;
      const evidence = await transaction.evidence.create({
        data: {
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          executionId: execution.id,
          createdByUserId: input.technicianId,
          kind: input.kind,
          objectKey: input.objectKey,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
        },
      });
      await audit(transaction, input, 'EVIDENCE_INTENT_CREATED', evidence.id);
      return { status: 'SUCCESS', evidence } as const;
    }, transactionOptions);
  }

  findAuthorized(input: Parameters<EvidenceRepository['findAuthorized']>[0]) {
    return this.prisma.evidence.findFirst({
      where: {
        id: input.evidenceId,
        organizationId: input.organizationId,
        ...(input.statuses ? { status: { in: input.statuses } } : {}),
        workOrder: {
          assignments: {
            some: { technicianId: input.technicianId, unassignedAt: null },
          },
        },
      },
    });
  }

  confirm(input: Parameters<EvidenceRepository['confirm']>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const execution = await editableExecution(transaction, input);
      if (!execution) return { status: 'NOT_FOUND' } as const;
      if (execution.status !== 'IN_PROGRESS')
        return { status: 'STATUS_LOCKED' } as const;
      const evidence = await transaction.evidence.findFirst({
        where: {
          id: input.evidenceId,
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          executionId: execution.id,
        },
      });
      if (!evidence) return { status: 'NOT_FOUND' } as const;
      if (evidence.status === 'AVAILABLE') {
        return { status: 'SUCCESS', evidence } as const;
      }
      if (execution.version !== input.expectedVersion)
        return { status: 'VERSION_CONFLICT' } as const;
      if (
        Number(evidence.sizeBytes) !== input.actualSizeBytes ||
        evidence.contentType !== input.actualContentType
      ) {
        return { status: 'OBJECT_MISMATCH' } as const;
      }
      const version = await bumpExecution(transaction, execution.id, input);
      if (!version) return { status: 'VERSION_CONFLICT' } as const;
      const available = await transaction.evidence.update({
        where: { id: evidence.id },
        data: { status: 'AVAILABLE', confirmedAt: new Date() },
      });
      await audit(transaction, input, 'EVIDENCE_CONFIRMED', evidence.id);
      return { status: 'SUCCESS', evidence: available } as const;
    }, transactionOptions);
  }

  remove(input: Parameters<EvidenceRepository['remove']>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const execution = await editableExecution(transaction, input);
      if (!execution) return { status: 'NOT_FOUND' } as const;
      if (execution.status !== 'IN_PROGRESS')
        return { status: 'STATUS_LOCKED' } as const;
      if (execution.version !== input.expectedVersion)
        return { status: 'VERSION_CONFLICT' } as const;
      const evidence = await transaction.evidence.findFirst({
        where: {
          id: input.evidenceId,
          organizationId: input.organizationId,
          workOrderId: input.workOrderId,
          executionId: execution.id,
        },
      });
      if (!evidence) return { status: 'NOT_FOUND' } as const;
      const version = await bumpExecution(transaction, execution.id, input);
      if (!version) return { status: 'VERSION_CONFLICT' } as const;
      await transaction.evidence.delete({ where: { id: evidence.id } });
      await audit(transaction, input, 'EVIDENCE_REMOVED', evidence.id);
      return { status: 'SUCCESS', evidence } as const;
    }, transactionOptions);
  }
}

const transactionOptions = { maxWait: 10_000, timeout: 10_000 } as const;

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
  evidenceId: string,
) {
  return transaction.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.technicianId,
      requestId: input.requestId,
      action,
      resourceType: 'EVIDENCE',
      resourceId: evidenceId,
    },
  });
}

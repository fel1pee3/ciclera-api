import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type { ReportRepository } from '../application/ports/report.repository';

@Injectable()
export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findServiceReport(
    input: Parameters<ReportRepository['findServiceReport']>[0],
  ) {
    const order = await this.prisma.workOrder.findFirst({
      where: {
        id: input.workOrderId,
        organizationId: input.organizationId,
        status: { in: ['READY_TO_BILL', 'BILLED'] },
        finalAmountInCents: { not: null },
        execution: { isNot: null },
      },
      select: {
        id: true,
        number: true,
        status: true,
        title: true,
        serviceType: true,
        description: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        actualStartAt: true,
        actualEndAt: true,
        expectedAmountInCents: true,
        finalAmountInCents: true,
        organization: { select: { name: true, timezone: true } },
        customer: { select: { name: true, document: true } },
        location: {
          select: {
            name: true,
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
          },
        },
        equipment: {
          select: {
            name: true,
            identifier: true,
            category: true,
            brand: true,
            model: true,
            serialNumber: true,
          },
        },
        execution: {
          select: {
            notes: true,
            startedAt: true,
            technician: { select: { name: true } },
          },
        },
        additionalItems: {
          select: {
            type: true,
            description: true,
            quantityInThousand: true,
            unitAmountInCents: true,
            totalAmountInCents: true,
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        evidence: {
          where: { status: 'AVAILABLE' },
          select: { id: true, kind: true, objectKey: true, contentType: true },
          orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
          take: 10,
        },
      },
    });
    if (
      !order?.execution ||
      !order.finalAmountInCents ||
      (order.status !== 'READY_TO_BILL' && order.status !== 'BILLED')
    ) {
      return null;
    }
    return {
      ...order,
      status: order.status,
      finalAmountInCents: order.finalAmountInCents,
      execution: {
        technicianName: order.execution.technician.name,
        notes: order.execution.notes,
        startedAt: order.execution.startedAt,
      },
    };
  }
}

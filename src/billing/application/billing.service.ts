import { Inject, Injectable, PayloadTooLargeException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import {
  WorkOrderManagementForbiddenError,
  WorkOrderNotFoundError,
  WorkOrderStatusLockedError,
  WorkOrderVersionConflictError,
} from '../../work-orders/domain/work-order.errors';
import {
  BILLING_REPOSITORY,
  type BillingReadyQuery,
  type BillingRepository,
} from './ports/billing.repository';

@Injectable()
export class BillingService {
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly billing: BillingRepository,
  ) {}

  async listReady(
    principal: AuthenticatedPrincipal,
    query: Omit<BillingReadyQuery, 'organizationId'>,
  ) {
    this.requireManager(principal);
    return this.billing.listReady({
      ...query,
      organizationId: principal.organizationId,
    });
  }

  async markBilled(
    principal: AuthenticatedPrincipal,
    requestId: string,
    workOrderId: string,
    version: number,
  ) {
    this.requireManager(principal);
    const result = await this.billing.markBilled({
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId,
      workOrderId,
      expectedVersion: version,
    });
    if (result.status === 'NOT_FOUND') throw new WorkOrderNotFoundError();
    if (result.status === 'STATUS_LOCKED') {
      throw new WorkOrderStatusLockedError();
    }
    if (result.status === 'VERSION_CONFLICT') {
      throw new WorkOrderVersionConflictError();
    }
    return {
      status: 'BILLED' as const,
      billedAt: result.billedAt,
      billedByUserId: result.billedByUserId,
    };
  }

  async exportReady(
    principal: AuthenticatedPrincipal,
    query: Omit<BillingReadyQuery, 'organizationId' | 'page' | 'pageSize'>,
  ) {
    this.requireManager(principal);
    const records = await this.billing.exportReady({
      ...query,
      organizationId: principal.organizationId,
      limit: 5_001,
    });
    if (records.length > 5_000) {
      throw new PayloadTooLargeException(
        'Refine os filtros para exportar no máximo 5.000 ordens.',
      );
    }
    return buildBillingCsv(records);
  }

  private requireManager(principal: AuthenticatedPrincipal) {
    if (principal.role === 'TECHNICIAN') {
      throw new WorkOrderManagementForbiddenError();
    }
  }
}

export function buildBillingCsv(
  records: Awaited<ReturnType<BillingRepository['exportReady']>>,
): string {
  const header = [
    'numero',
    'data_conclusao',
    'data_aprovacao',
    'cliente',
    'documento',
    'descricao',
    'valor_centavos',
    'status',
  ];
  const rows = records.map((record) => [
    record.number.toString(),
    record.actualEndAt.toISOString(),
    record.approvedAt.toISOString(),
    record.customer.name,
    record.customerDocument ?? '',
    `${record.serviceType} - ${record.title}`,
    record.finalAmountInCents.toString(),
    'READY_TO_BILL',
  ]);
  return `\uFEFF${[header, ...rows]
    .map((row) => row.map(csvCell).join(';'))
    .join('\r\n')}\r\n`;
}

function csvCell(value: string): string {
  const protectedValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

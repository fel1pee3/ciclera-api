import { Inject, Injectable } from '@nestjs/common';
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

  private requireManager(principal: AuthenticatedPrincipal) {
    if (principal.role === 'TECHNICIAN') {
      throw new WorkOrderManagementForbiddenError();
    }
  }
}

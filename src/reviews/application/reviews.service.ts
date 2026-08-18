import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import {
  WorkOrderManagementForbiddenError,
  WorkOrderNotFoundError,
  WorkOrderStatusLockedError,
  WorkOrderVersionConflictError,
} from '../../work-orders/domain/work-order.errors';
import { displayText } from '../../customers/domain/normalization';
import type { ReviewReason } from '../domain/review';
import {
  REVIEW_REPOSITORY,
  type ReviewRepository,
} from './ports/review.repository';

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: ReviewRepository,
  ) {}

  private requireManager(principal: AuthenticatedPrincipal) {
    if (principal.role === 'TECHNICIAN') {
      throw new WorkOrderManagementForbiddenError();
    }
  }

  list(
    principal: AuthenticatedPrincipal,
    query: {
      page: number;
      pageSize: number;
      orderBy: 'AGING_DESC' | 'EXPECTED_AMOUNT_DESC';
    },
  ) {
    this.requireManager(principal);
    return this.reviews.list({
      ...query,
      organizationId: principal.organizationId,
    });
  }

  async find(principal: AuthenticatedPrincipal, workOrderId: string) {
    this.requireManager(principal);
    const result = await this.reviews.find(
      principal.organizationId,
      workOrderId,
    );
    if (!result) throw new WorkOrderNotFoundError();
    return result;
  }

  async requestCorrection(
    principal: AuthenticatedPrincipal,
    requestId: string,
    workOrderId: string,
    input: { version: number; reason: ReviewReason; description: string },
  ) {
    this.requireManager(principal);
    const result = await this.reviews.requestCorrection({
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId,
      workOrderId,
      expectedVersion: input.version,
      reason: input.reason,
      description: displayText(input.description),
    });
    if (result.status === 'NOT_FOUND') throw new WorkOrderNotFoundError();
    if (result.status === 'STATUS_LOCKED')
      throw new WorkOrderStatusLockedError();
    if (result.status === 'VERSION_CONFLICT') {
      throw new WorkOrderVersionConflictError();
    }
    return { status: 'PENDING_CORRECTION' as const };
  }

  async approve(
    principal: AuthenticatedPrincipal,
    requestId: string,
    workOrderId: string,
    version: number,
  ) {
    this.requireManager(principal);
    const result = await this.reviews.approve({
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
      status: 'READY_TO_BILL' as const,
      finalAmountInCents: result.finalAmountInCents,
    };
  }
}

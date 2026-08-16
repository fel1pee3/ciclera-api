import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { WorkOrderNotFoundError } from '../../work-orders/domain/work-order.errors';
import {
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

  list(
    principal: AuthenticatedPrincipal,
    query: {
      page: number;
      pageSize: number;
      orderBy: 'AGING_DESC' | 'EXPECTED_AMOUNT_DESC';
    },
  ) {
    return this.reviews.list({
      ...query,
      organizationId: principal.organizationId,
    });
  }

  async find(principal: AuthenticatedPrincipal, workOrderId: string) {
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
}

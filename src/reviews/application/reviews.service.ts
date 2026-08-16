import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { WorkOrderNotFoundError } from '../../work-orders/domain/work-order.errors';
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
}

import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import {
  WorkOrderManagementForbiddenError,
  WorkOrderNotFoundError,
} from '../../work-orders/domain/work-order.errors';
import {
  HISTORY_REPOSITORY,
  type HistoryRepository,
} from './ports/history.repository';

@Injectable()
export class HistoryService {
  constructor(
    @Inject(HISTORY_REPOSITORY) private readonly history: HistoryRepository,
  ) {}

  async find(principal: AuthenticatedPrincipal, workOrderId: string) {
    if (principal.role === 'TECHNICIAN') {
      throw new WorkOrderManagementForbiddenError();
    }
    const history = await this.history.find({
      organizationId: principal.organizationId,
      workOrderId,
    });
    if (!history) throw new WorkOrderNotFoundError();
    return history;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { WorkOrderManagementForbiddenError } from '../../work-orders/domain/work-order.errors';
import {
  DASHBOARD_REPOSITORY,
  type DashboardRepository,
} from './ports/dashboard.repository';

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DASHBOARD_REPOSITORY)
    private readonly dashboard: DashboardRepository,
  ) {}

  summary(
    principal: AuthenticatedPrincipal,
    period: { from: string; to: string },
  ) {
    if (principal.role === 'TECHNICIAN') {
      throw new WorkOrderManagementForbiddenError();
    }
    return this.dashboard.summary({
      organizationId: principal.organizationId,
      ...period,
    });
  }
}

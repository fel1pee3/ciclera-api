import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { WorkOrderNotFoundError } from '../domain/work-order.errors';
import {
  TECHNICIAN_WORK_ORDER_REPOSITORY,
  type TechnicianWorkOrderRepository,
  type TechnicianWorkOrderView,
} from './ports/technician-work-order.repository';

@Injectable()
export class TechnicianWorkOrdersService {
  constructor(
    @Inject(TECHNICIAN_WORK_ORDER_REPOSITORY)
    private readonly workOrders: TechnicianWorkOrderRepository,
  ) {}

  list(
    principal: AuthenticatedPrincipal,
    query: { page: number; pageSize: number; view?: TechnicianWorkOrderView },
  ) {
    return this.workOrders.list({
      ...query,
      organizationId: principal.organizationId,
      technicianId: principal.userId,
    });
  }

  async find(principal: AuthenticatedPrincipal, workOrderId: string) {
    const workOrder = await this.workOrders.find(
      principal.organizationId,
      principal.userId,
      workOrderId,
    );
    if (!workOrder) throw new WorkOrderNotFoundError();
    return workOrder;
  }
}

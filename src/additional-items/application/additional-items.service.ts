import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { optionalText } from '../../customers/domain/normalization';
import { TechnicianWorkOrdersService } from '../../work-orders/application/technician-work-orders.service';
import {
  WorkOrderStatusLockedError,
  WorkOrderVersionConflictError,
} from '../../work-orders/domain/work-order.errors';
import {
  calculateTotal,
  parseQuantity,
  parseUnitAmount,
  type AdditionalItemType,
} from '../domain/additional-item';
import {
  AdditionalItemInvalidError,
  AdditionalItemNotFoundError,
} from '../domain/additional-item.errors';
import {
  ADDITIONAL_ITEM_REPOSITORY,
  type AdditionalItemMutationResult,
  type AdditionalItemRepository,
} from './ports/additional-item.repository';

@Injectable()
export class AdditionalItemsService {
  constructor(
    @Inject(ADDITIONAL_ITEM_REPOSITORY)
    private readonly items: AdditionalItemRepository,
    private readonly workOrders: TechnicianWorkOrdersService,
  ) {}

  async create(
    principal: AuthenticatedPrincipal,
    requestId: string,
    workOrderId: string,
    input: ItemInput,
  ) {
    resolve(
      await this.items.create({
        ...normalize(input),
        organizationId: principal.organizationId,
        technicianId: principal.userId,
        workOrderId,
        expectedVersion: input.version,
        requestId,
      }),
    );
    return this.workOrders.find(principal, workOrderId);
  }

  async update(
    principal: AuthenticatedPrincipal,
    requestId: string,
    workOrderId: string,
    itemId: string,
    input: ItemInput,
  ) {
    resolve(
      await this.items.update({
        ...normalize(input),
        organizationId: principal.organizationId,
        technicianId: principal.userId,
        workOrderId,
        itemId,
        expectedVersion: input.version,
        requestId,
      }),
    );
    return this.workOrders.find(principal, workOrderId);
  }

  async remove(
    principal: AuthenticatedPrincipal,
    requestId: string,
    workOrderId: string,
    itemId: string,
    version: number,
  ) {
    resolve(
      await this.items.remove({
        organizationId: principal.organizationId,
        technicianId: principal.userId,
        workOrderId,
        itemId,
        expectedVersion: version,
        requestId,
      }),
    );
    return this.workOrders.find(principal, workOrderId);
  }
}

interface ItemInput {
  version: number;
  type: AdditionalItemType;
  description: string;
  quantity: string;
  unitAmountInCents: string;
}

function normalize(input: ItemInput) {
  try {
    const description = optionalText(input.description);
    if (!description) throw new Error('INVALID_ADDITIONAL_ITEM');
    const quantityInThousand = parseQuantity(input.quantity);
    const unitAmountInCents = parseUnitAmount(input.unitAmountInCents);
    return {
      type: input.type,
      description,
      quantityInThousand,
      unitAmountInCents,
      totalAmountInCents: calculateTotal(quantityInThousand, unitAmountInCents),
    };
  } catch {
    throw new AdditionalItemInvalidError();
  }
}

function resolve(result: AdditionalItemMutationResult): void {
  if (result.status === 'SUCCESS') return;
  if (result.status === 'NOT_FOUND') throw new AdditionalItemNotFoundError();
  if (result.status === 'STATUS_LOCKED') throw new WorkOrderStatusLockedError();
  throw new WorkOrderVersionConflictError();
}

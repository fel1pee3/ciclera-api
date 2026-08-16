import type { AdditionalItemType } from '../../domain/additional-item';

export const ADDITIONAL_ITEM_REPOSITORY = Symbol('ADDITIONAL_ITEM_REPOSITORY');

export type AdditionalItemMutationResult =
  | { status: 'SUCCESS' }
  | { status: 'NOT_FOUND' }
  | { status: 'STATUS_LOCKED' }
  | { status: 'VERSION_CONFLICT' };

export interface AdditionalItemRepository {
  create(input: {
    organizationId: string;
    technicianId: string;
    workOrderId: string;
    expectedVersion: number;
    requestId: string;
    type: AdditionalItemType;
    description: string;
    quantityInThousand: bigint;
    unitAmountInCents: bigint;
    totalAmountInCents: bigint;
  }): Promise<AdditionalItemMutationResult>;
  update(input: {
    organizationId: string;
    technicianId: string;
    workOrderId: string;
    itemId: string;
    expectedVersion: number;
    requestId: string;
    type: AdditionalItemType;
    description: string;
    quantityInThousand: bigint;
    unitAmountInCents: bigint;
    totalAmountInCents: bigint;
  }): Promise<AdditionalItemMutationResult>;
  remove(input: {
    organizationId: string;
    technicianId: string;
    workOrderId: string;
    itemId: string;
    expectedVersion: number;
    requestId: string;
  }): Promise<AdditionalItemMutationResult>;
}

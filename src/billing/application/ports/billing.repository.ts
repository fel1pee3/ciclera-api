export const BILLING_REPOSITORY = Symbol('BILLING_REPOSITORY');

export interface BillingReadyItem {
  id: string;
  number: bigint;
  title: string;
  customer: { id: string; name: string };
  actualEndAt: Date;
  approvedAt: Date;
  finalAmountInCents: bigint;
  version: number;
}

export interface BillingReadyQuery {
  organizationId: string;
  page: number;
  pageSize: number;
  customerId?: string;
  completedFrom?: Date;
  completedTo?: Date;
  minimumAgingDays?: number;
  minimumAmountInCents?: bigint;
  maximumAmountInCents?: bigint;
}

export type MarkBilledResult =
  | {
      status: 'SUCCESS' | 'ALREADY_BILLED';
      billedAt: Date;
      billedByUserId: string;
    }
  | { status: 'NOT_FOUND' }
  | { status: 'STATUS_LOCKED' }
  | { status: 'VERSION_CONFLICT' };

export interface BillingRepository {
  listReady(input: BillingReadyQuery): Promise<{
    items: BillingReadyItem[];
    page: number;
    pageSize: number;
    total: number;
    totalAmountInCents: bigint;
  }>;
  exportReady(
    input: Omit<BillingReadyQuery, 'page' | 'pageSize'> & { limit: number },
  ): Promise<
    Array<
      BillingReadyItem & {
        serviceType: string;
        customerDocument: string | null;
      }
    >
  >;
  markBilled(input: {
    organizationId: string;
    actorUserId: string;
    requestId: string;
    workOrderId: string;
    expectedVersion: number;
  }): Promise<MarkBilledResult>;
}

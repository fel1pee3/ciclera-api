import type { ReviewReason } from '../../../reviews/domain/review';
import type { WorkOrderStatus } from '../../../work-orders/domain/work-order';

export const DASHBOARD_REPOSITORY = Symbol('DASHBOARD_REPOSITORY');

export const dashboardStatuses = [
  'IN_PROGRESS',
  'AWAITING_REVIEW',
  'PENDING_CORRECTION',
  'READY_TO_BILL',
  'BILLED',
] as const satisfies readonly WorkOrderStatus[];

export type DashboardStatus = (typeof dashboardStatuses)[number];

export interface DashboardSummary {
  timezone: string;
  period: { from: string; to: string };
  setup: {
    activeUserCount: number;
    customerCount: number;
    locationCount: number;
    equipmentCount: number;
    workOrderCount: number;
  };
  stages: Record<DashboardStatus, { count: number; amountInCents: bigint }>;
  blockedAmountInCents: bigint;
  averageReviewWaitingSeconds: number | null;
  oldestBlocked: Array<{
    id: string;
    number: bigint;
    title: string;
    status: 'AWAITING_REVIEW' | 'PENDING_CORRECTION';
    waitingSince: Date;
    agingSeconds: number;
  }>;
  recurringBlockers: Array<{ reason: ReviewReason; count: number }>;
}

export interface DashboardRepository {
  summary(input: {
    organizationId: string;
    from: string;
    to: string;
  }): Promise<DashboardSummary>;
}

export const HISTORY_REPOSITORY = Symbol('HISTORY_REPOSITORY');

export type TimelineEntry =
  | {
      id: string;
      type: 'STATUS';
      occurredAt: Date;
      actor: { id: string; name: string };
      previousStatus: string | null;
      newStatus: string;
      reason: string | null;
    }
  | {
      id: string;
      type: 'ASSIGNMENT';
      occurredAt: Date;
      actor: { id: string; name: string };
      technician: { id: string; name: string };
      action: 'ASSIGNED' | 'UNASSIGNED';
    }
  | {
      id: string;
      type: 'REVIEW';
      occurredAt: Date;
      actor: { id: string; name: string };
      decision: string;
      reason: string | null;
      description: string | null;
    }
  | {
      id: string;
      type: 'BILLING';
      occurredAt: Date;
      actor: { id: string; name: string };
      action: 'BILLED';
    };

export interface HistoryRepository {
  find(input: { organizationId: string; workOrderId: string }): Promise<{
    timeline: TimelineEntry[];
    audit: Array<{
      id: string;
      action: string;
      actor: { id: string; name: string };
      requestId: string;
      metadata: Record<string, string> | null;
      occurredAt: Date;
    }>;
  } | null>;
}

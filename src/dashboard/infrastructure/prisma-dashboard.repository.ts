import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type ReviewReason,
  type WorkOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type {
  DashboardRepository,
  DashboardStatus,
} from '../application/ports/dashboard.repository';

interface StageRow {
  status: WorkOrderStatus;
  count: bigint;
  amount: bigint;
}

interface ReviewWaitRow {
  averageSeconds: number | null;
}

interface BlockerRow {
  reason: ReviewReason;
  count: bigint;
}

@Injectable()
export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async summary(input: Parameters<DashboardRepository['summary']>[0]) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: input.organizationId },
      select: { timezone: true },
    });
    const { from, toExclusive } = localDateRangeToUtc(
      input.from,
      input.to,
      organization.timezone,
    );
    const now = new Date();
    const [stageRows, reviewWait, oldestBlocked, blockerRows] =
      await this.prisma.$transaction([
        this.prisma.$queryRaw<StageRow[]>(Prisma.sql`
          SELECT status,
                 COUNT(*)::bigint AS count,
                 COALESCE(SUM(
                   CASE WHEN status IN ('READY_TO_BILL', 'BILLED')
                     THEN COALESCE(final_amount_in_cents, 0)
                     ELSE COALESCE(expected_amount_in_cents, 0) + COALESCE(items.total, 0)
                   END
                 ), 0)::bigint AS amount
          FROM work_orders wo
          LEFT JOIN LATERAL (
            SELECT SUM(total_amount_in_cents)::bigint AS total
            FROM additional_items ai
            WHERE ai.organization_id = wo.organization_id
              AND ai.work_order_id = wo.id
          ) items ON true
          WHERE wo.organization_id = ${input.organizationId}::uuid
            AND wo.status IN ('IN_PROGRESS', 'AWAITING_REVIEW', 'PENDING_CORRECTION', 'READY_TO_BILL', 'BILLED')
            AND CASE WHEN wo.status = 'BILLED'
              THEN wo.billed_at >= ${from} AND wo.billed_at < ${toExclusive}
              ELSE wo.created_at >= ${from} AND wo.created_at < ${toExclusive}
            END
          GROUP BY status
        `),
        this.prisma.$queryRaw<ReviewWaitRow[]>(Prisma.sql`
          SELECT AVG(EXTRACT(EPOCH FROM (${now} - actual_end_at)))::float8 AS "averageSeconds"
          FROM work_orders
          WHERE organization_id = ${input.organizationId}::uuid
            AND status = 'AWAITING_REVIEW'
            AND created_at >= ${from} AND created_at < ${toExclusive}
            AND actual_end_at IS NOT NULL
        `),
        this.prisma.workOrder.findMany({
          where: {
            organizationId: input.organizationId,
            status: { in: ['AWAITING_REVIEW', 'PENDING_CORRECTION'] },
            createdAt: { gte: from, lt: toExclusive },
            actualEndAt: { not: null },
          },
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            actualEndAt: true,
          },
          orderBy: [{ actualEndAt: 'asc' }, { id: 'asc' }],
          take: 5,
        }),
        this.prisma.$queryRaw<BlockerRow[]>(Prisma.sql`
          SELECT reason, COUNT(*)::bigint AS count
          FROM reviews
          WHERE organization_id = ${input.organizationId}::uuid
            AND decision = 'CORRECTION_REQUESTED'
            AND reason IS NOT NULL
            AND created_at >= ${from} AND created_at < ${toExclusive}
          GROUP BY reason
          ORDER BY count DESC, reason ASC
          LIMIT 5
        `),
      ]);

    const empty = () => ({ count: 0, amountInCents: 0n });
    const stages: Record<DashboardStatus, ReturnType<typeof empty>> = {
      IN_PROGRESS: empty(),
      AWAITING_REVIEW: empty(),
      PENDING_CORRECTION: empty(),
      READY_TO_BILL: empty(),
      BILLED: empty(),
    };
    for (const row of stageRows) {
      if (row.status in stages) {
        stages[row.status as DashboardStatus] = {
          count: Number(row.count),
          amountInCents: row.amount,
        };
      }
    }
    const average = reviewWait[0]?.averageSeconds;
    const averageReviewWaitingSeconds =
      average === null || average === undefined
        ? null
        : Math.max(0, Math.floor(average));
    return {
      timezone: organization.timezone,
      period: { from: input.from, to: input.to },
      stages,
      blockedAmountInCents: stages.PENDING_CORRECTION.amountInCents,
      averageReviewWaitingSeconds,
      oldestBlocked: oldestBlocked.flatMap((order) =>
        order.actualEndAt &&
        (order.status === 'AWAITING_REVIEW' ||
          order.status === 'PENDING_CORRECTION')
          ? [
              {
                ...order,
                status: order.status,
                waitingSince: order.actualEndAt,
                agingSeconds: Math.max(
                  0,
                  Math.floor(
                    (now.getTime() - order.actualEndAt.getTime()) / 1000,
                  ),
                ),
              },
            ]
          : [],
      ),
      recurringBlockers: blockerRows.map((row) => ({
        reason: row.reason,
        count: Number(row.count),
      })),
    };
  }
}

function localDateRangeToUtc(from: string, to: string, timezone: string) {
  return {
    from: zonedMidnightToUtc(from, timezone),
    toExclusive: zonedMidnightToUtc(addDays(to, 1), timezone),
  };
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function zonedMidnightToUtc(date: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  let instant = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .map((part) => [part.type, part.value]),
    );
    const rendered = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    instant += Date.UTC(year, month - 1, day) - rendered;
  }
  return new Date(instant);
}

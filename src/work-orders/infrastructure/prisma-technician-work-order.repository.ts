import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type {
  TechnicianWorkOrderRepository,
  TechnicianWorkOrderView,
} from '../application/ports/technician-work-order.repository';

const technicianWorkOrderSelect = {
  id: true,
  number: true,
  customer: { select: { id: true, name: true } },
  location: {
    select: {
      id: true,
      name: true,
      street: true,
      number: true,
      complement: true,
      neighborhood: true,
      city: true,
      state: true,
    },
  },
  equipment: { select: { id: true, name: true, identifier: true } },
  serviceType: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  actualStartAt: true,
  actualEndAt: true,
  version: true,
} as const;

@Injectable()
export class PrismaTechnicianWorkOrderRepository implements TechnicianWorkOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: Parameters<TechnicianWorkOrderRepository['list']>[0]) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { timezone: true },
    });
    const timezone = organization?.timezone ?? 'UTC';
    const where: Prisma.WorkOrderWhereInput = {
      organizationId: input.organizationId,
      assignments: {
        some: { technicianId: input.technicianId, unassignedAt: null },
      },
      ...viewWhere(input.view, timezone),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.workOrder.findMany({
        where,
        select: technicianWorkOrderSelect,
        orderBy: [
          { scheduledStartAt: { sort: 'asc', nulls: 'last' } },
          { id: 'asc' },
        ],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.workOrder.count({ where }),
    ]);
    return {
      items,
      total,
      page: input.page,
      pageSize: input.pageSize,
      timezone,
    };
  }

  find(organizationId: string, technicianId: string, workOrderId: string) {
    return this.prisma.workOrder.findFirst({
      where: {
        id: workOrderId,
        organizationId,
        assignments: { some: { technicianId, unassignedAt: null } },
      },
      select: technicianWorkOrderSelect,
    });
  }
}

function viewWhere(
  view: TechnicianWorkOrderView | undefined,
  timezone: string,
): Prisma.WorkOrderWhereInput {
  if (view === 'IN_PROGRESS') return { status: 'IN_PROGRESS' };
  if (view === 'PENDING') return { status: 'PENDING_CORRECTION' };
  if (view === 'TODAY' || view === 'UPCOMING') {
    const today = dateInTimezone(new Date(), timezone);
    const tomorrow = addDays(today, 1);
    return view === 'TODAY'
      ? {
          status: { in: ['SCHEDULED', 'IN_PROGRESS', 'PENDING_CORRECTION'] },
          scheduledStartAt: {
            gte: zonedMidnightToUtc(today, timezone),
            lt: zonedMidnightToUtc(tomorrow, timezone),
          },
        }
      : {
          status: 'SCHEDULED',
          scheduledStartAt: {
            gte: zonedMidnightToUtc(tomorrow, timezone),
          },
        };
  }
  return {
    status: { in: ['SCHEDULED', 'IN_PROGRESS', 'PENDING_CORRECTION'] },
  };
}

function dateInTimezone(value: Date, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
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

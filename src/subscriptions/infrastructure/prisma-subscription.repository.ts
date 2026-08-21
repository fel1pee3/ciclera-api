import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import {
  SubscriptionLimitExceededError,
  SubscriptionRequiredError,
  SubscriptionWebhookInvalidError,
} from '../domain/subscription.errors';
import { getSubscriptionPlan } from '../domain/subscription-plan';
import type { SubscriptionRepository } from '../application/ports/subscription.repository';

const webhookSchema = z
  .object({
    id: z.string().min(1).max(160),
    event: z.string().min(1).max(100),
    subscription: z
      .object({
        id: z.string().min(1).max(100),
        customer: z.string().min(1).max(100).optional(),
        status: z.string().optional(),
        value: z.number().nonnegative().optional(),
        nextDueDate: z.string().optional(),
        billingType: z.string().optional(),
        externalReference: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
    payment: z
      .object({
        id: z.string().min(1).max(100),
        subscription: z.string().nullable().optional(),
        status: z.string().optional(),
        value: z.number().nonnegative().optional(),
        dueDate: z.string().optional(),
        paymentDate: z.string().nullable().optional(),
        clientPaymentDate: z.string().nullable().optional(),
        billingType: z.string().optional(),
        invoiceUrl: z.string().url().nullable().optional(),
        bankSlipUrl: z.string().url().nullable().optional(),
        externalReference: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

@Injectable()
export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async current(organizationId: string) {
    const subscription = await this.prisma.organizationSubscription.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
      include: {
        payments: {
          where: { status: { in: ['PENDING', 'OVERDUE'] } },
          orderBy: { dueDate: 'desc' },
          take: 1,
          select: { invoiceUrl: true },
        },
      },
    });
    const { payments, ...record } = subscription;
    return {
      ...record,
      latestInvoiceUrl: payments[0]?.invoiceUrl ?? null,
    };
  }

  async usage(organizationId: string) {
    const [technicians, administrativeUsers, evidence] =
      await this.prisma.$transaction([
        this.prisma.user.count({
          where: { organizationId, status: 'ACTIVE', role: 'TECHNICIAN' },
        }),
        this.prisma.user.count({
          where: {
            organizationId,
            status: 'ACTIVE',
            role: { in: ['OWNER', 'ADMIN'] },
          },
        }),
        this.prisma.evidence.aggregate({
          where: { organizationId },
          _sum: { sizeBytes: true },
        }),
      ]);
    return {
      technicians,
      administrativeUsers,
      evidenceStorageBytes: evidence._sum.sizeBytes ?? 0n,
    };
  }

  organizationCheckoutIdentity(organizationId: string) {
    return this.prisma.organization
      .findUnique({
        where: { id: organizationId },
        select: {
          name: true,
          users: {
            where: { role: 'OWNER', status: 'ACTIVE' },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { name: true, email: true },
          },
        },
      })
      .then((organization) => {
        const owner = organization?.users[0];
        return organization && owner
          ? {
              organizationName: organization.name,
              ownerName: owner.name,
              ownerEmail: owner.email,
            }
          : null;
      });
  }

  async createCheckout(
    input: Parameters<SubscriptionRepository['createCheckout']>[0],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const subscription = await transaction.organizationSubscription.upsert({
        where: { organizationId: input.organizationId },
        create: { organizationId: input.organizationId },
        update: {},
      });
      await transaction.subscriptionCheckout.updateMany({
        where: {
          organizationId: input.organizationId,
          status: 'PENDING',
          expiresAt: { lte: new Date() },
        },
        data: { status: 'EXPIRED' },
      });
      const checkout = await transaction.subscriptionCheckout.create({
        data: {
          organizationId: input.organizationId,
          subscriptionId: subscription.id,
          planCode: input.planCode,
          paymentMethod: input.paymentMethod,
          expiresAt: input.expiresAt,
        },
        select: { id: true },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          requestId: input.requestId,
          action: 'SUBSCRIPTION_CHECKOUT_CREATED',
          resourceType: 'SUBSCRIPTION',
          resourceId: subscription.id,
          metadata: {
            planCode: input.planCode,
            paymentMethod: input.paymentMethod,
          },
        },
      });
      return checkout;
    });
  }

  async attachProviderCheckout(
    input: Parameters<SubscriptionRepository['attachProviderCheckout']>[0],
  ) {
    const updated = await this.prisma.subscriptionCheckout.updateMany({
      where: {
        id: input.checkoutId,
        organizationId: input.organizationId,
        status: 'PENDING',
      },
      data: { providerCheckoutId: input.providerCheckoutId },
    });
    if (updated.count !== 1)
      throw new Error('Subscription checkout disappeared.');
  }

  async schedulePlanChange(
    input: Parameters<SubscriptionRepository['schedulePlanChange']>[0],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.organizationSubscription.findUnique({
        where: { organizationId: input.organizationId },
      });
      if (!current) throw new SubscriptionRequiredError();
      const updated = await transaction.organizationSubscription.update({
        where: { organizationId: input.organizationId },
        data: { scheduledPlanCode: input.planCode, version: { increment: 1 } },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          requestId: input.requestId,
          action: 'SUBSCRIPTION_PLAN_CHANGE_SCHEDULED',
          resourceType: 'SUBSCRIPTION',
          resourceId: updated.id,
          metadata: { from: current.planCode, to: input.planCode },
        },
      });
      return { ...updated, latestInvoiceUrl: null };
    });
  }

  async cancelAtPeriodEnd(
    input: Parameters<SubscriptionRepository['cancelAtPeriodEnd']>[0],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.organizationSubscription.findUnique({
        where: { organizationId: input.organizationId },
      });
      if (!current) throw new SubscriptionRequiredError();
      const updated = await transaction.organizationSubscription.update({
        where: { organizationId: input.organizationId },
        data: {
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
          status: 'CANCELED',
          version: { increment: 1 },
        },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          requestId: input.requestId,
          action: 'SUBSCRIPTION_CANCELLATION_SCHEDULED',
          resourceType: 'SUBSCRIPTION',
          resourceId: updated.id,
          metadata: {
            accessUntil: updated.currentPeriodEnd?.toISOString() ?? null,
          },
        },
      });
      return { ...updated, latestInvoiceUrl: null };
    });
  }

  async assertUserSeat(
    input: Parameters<SubscriptionRepository['assertUserSeat']>[0],
  ) {
    const [subscription, usage] = await Promise.all([
      this.current(input.organizationId),
      this.usage(input.organizationId),
    ]);
    if (!subscription.planCode) throw new SubscriptionRequiredError();
    const plan = getSubscriptionPlan(subscription.planCode);
    if (input.role === 'TECHNICIAN') {
      if (usage.technicians >= plan.maxTechnicians) {
        throw new SubscriptionLimitExceededError('TECHNICIANS');
      }
      return;
    }
    if (usage.administrativeUsers >= plan.maxAdministrativeUsers) {
      throw new SubscriptionLimitExceededError('ADMINISTRATIVE_USERS');
    }
  }

  async assertEvidenceStorage(
    input: Parameters<SubscriptionRepository['assertEvidenceStorage']>[0],
  ) {
    const [subscription, usage] = await Promise.all([
      this.current(input.organizationId),
      this.usage(input.organizationId),
    ]);
    if (!subscription.planCode) throw new SubscriptionRequiredError();
    const plan = getSubscriptionPlan(subscription.planCode);
    if (
      usage.evidenceStorageBytes + BigInt(input.incomingBytes) >
      BigInt(plan.evidenceStorageBytes)
    ) {
      throw new SubscriptionLimitExceededError('EVIDENCE_STORAGE');
    }
  }

  async processWebhook(payload: unknown) {
    const parsedEvent = webhookSchema.safeParse(payload);
    if (!parsedEvent.success) throw new SubscriptionWebhookInvalidError();
    const event = parsedEvent.data;
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const duplicate =
            await transaction.subscriptionWebhookEvent.findUnique({
              where: { providerEventId: event.id },
            });
          if (duplicate) return 'DUPLICATE' as const;

          const externalReference =
            event.subscription?.externalReference ??
            event.payment?.externalReference ??
            undefined;
          const providerSubscriptionId =
            event.subscription?.id ?? event.payment?.subscription ?? undefined;
          const checkout =
            externalReference && isUuid(externalReference)
              ? await transaction.subscriptionCheckout.findUnique({
                  where: { id: externalReference },
                })
              : null;
          const subscription = checkout
            ? await transaction.organizationSubscription.findUnique({
                where: { id: checkout.subscriptionId },
              })
            : providerSubscriptionId
              ? await transaction.organizationSubscription.findUnique({
                  where: { providerSubscriptionId },
                })
              : null;

          if (!subscription) {
            await transaction.subscriptionWebhookEvent.create({
              data: {
                providerEventId: event.id,
                eventType: event.event,
                resourceId: event.subscription?.id ?? event.payment?.id,
              },
            });
            return 'IGNORED' as const;
          }

          if (event.subscription) {
            const method =
              paymentMethod(event.subscription.billingType) ??
              checkout?.paymentMethod ??
              subscription.paymentMethod;
            await transaction.organizationSubscription.update({
              where: { id: subscription.id },
              data: {
                providerSubscriptionId: event.subscription.id,
                providerCustomerId: event.subscription.customer,
                paymentMethod: method,
                nextDueDate: parseDate(event.subscription.nextDueDate),
                ...(event.event === 'SUBSCRIPTION_INACTIVATED' ||
                event.event === 'SUBSCRIPTION_DELETED'
                  ? {
                      status: 'CANCELED',
                      cancelAtPeriodEnd: true,
                      canceledAt: new Date(),
                    }
                  : {}),
                version: { increment: 1 },
              },
            });
          }

          if (event.payment) {
            const incomingStatus = paymentStatus(
              event.event,
              event.payment.status,
            );
            const method =
              paymentMethod(event.payment.billingType) ??
              checkout?.paymentMethod ??
              subscription.paymentMethod ??
              'BOLETO';
            const amountInCents = Math.round((event.payment.value ?? 0) * 100);
            const dueDate = parseDate(event.payment.dueDate) ?? new Date();
            const paidAt = parseDateTime(
              event.payment.paymentDate ?? event.payment.clientPaymentDate,
            );
            const existingPayment =
              await transaction.subscriptionPayment.findUnique({
                where: { providerPaymentId: event.payment.id },
                select: { status: true, amountInCents: true },
              });
            const status = reconcilePaymentStatus(
              existingPayment?.status,
              incomingStatus,
            );
            const wasAlreadyPaid =
              existingPayment?.status === 'CONFIRMED' ||
              existingPayment?.status === 'RECEIVED';
            const verifiedAmountInCents =
              existingPayment?.amountInCents ?? BigInt(amountInCents);
            await transaction.subscriptionPayment.upsert({
              where: { providerPaymentId: event.payment.id },
              create: {
                organizationId: subscription.organizationId,
                subscriptionId: subscription.id,
                providerPaymentId: event.payment.id,
                providerSubscriptionId: event.payment.subscription,
                status,
                paymentMethod: method,
                amountInCents,
                dueDate,
                paidAt,
                invoiceUrl: safeInvoiceUrl(
                  event.payment.invoiceUrl ?? event.payment.bankSlipUrl,
                ),
              },
              update: {
                status,
                paidAt,
                invoiceUrl: safeInvoiceUrl(
                  event.payment.invoiceUrl ?? event.payment.bankSlipUrl,
                ),
              },
            });

            if (
              !wasAlreadyPaid &&
              status === incomingStatus &&
              (status === 'CONFIRMED' || status === 'RECEIVED')
            ) {
              const selectedPlan =
                checkout?.planCode ??
                subscription.scheduledPlanCode ??
                subscription.planCode;
              if (
                selectedPlan &&
                verifiedAmountInCents ===
                  BigInt(getSubscriptionPlan(selectedPlan).priceInCents)
              ) {
                const periodStart = paidAt ?? new Date();
                const periodEnd = addMonth(
                  dueDate > periodStart ? dueDate : periodStart,
                );
                await transaction.organizationSubscription.update({
                  where: { id: subscription.id },
                  data: {
                    planCode: selectedPlan,
                    scheduledPlanCode: null,
                    status: 'ACTIVE',
                    paymentMethod: method,
                    providerSubscriptionId:
                      event.payment.subscription ??
                      subscription.providerSubscriptionId,
                    currentPeriodStart: periodStart,
                    currentPeriodEnd: periodEnd,
                    nextDueDate: periodEnd,
                    overdueSince: null,
                    cancelAtPeriodEnd: false,
                    canceledAt: null,
                    version: { increment: 1 },
                  },
                });
                if (checkout) {
                  await transaction.subscriptionCheckout.update({
                    where: { id: checkout.id },
                    data: { status: 'PAID', completedAt: new Date() },
                  });
                }
              }
            } else if (status === incomingStatus && status === 'OVERDUE') {
              await transaction.organizationSubscription.update({
                where: { id: subscription.id },
                data: {
                  status: 'PAST_DUE',
                  overdueSince: dueDate,
                  version: { increment: 1 },
                },
              });
            } else if (
              status === incomingStatus &&
              (status === 'REFUNDED' || status === 'CHARGEBACK')
            ) {
              await transaction.organizationSubscription.update({
                where: { id: subscription.id },
                data: {
                  status: 'PAST_DUE',
                  overdueSince: new Date(),
                  version: { increment: 1 },
                },
              });
            }
          }

          await transaction.subscriptionWebhookEvent.create({
            data: {
              providerEventId: event.id,
              eventType: event.event,
              organizationId: subscription.organizationId,
              resourceId: event.subscription?.id ?? event.payment?.id,
            },
          });
          return 'PROCESSED' as const;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 15_000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return 'DUPLICATE';
      throw error;
    }
  }
}

function isUuid(value: string): boolean {
  return z.string().uuid().safeParse(value).success;
}

function parseDate(value?: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateTime(value?: string | null): Date | null {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00.000Z`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonth(value: Date): Date {
  const result = new Date(value);
  result.setUTCMonth(result.getUTCMonth() + 1);
  return result;
}

function paymentMethod(
  value?: string | null,
): 'CREDIT_CARD' | 'PIX' | 'BOLETO' | null {
  return value === 'CREDIT_CARD' || value === 'PIX' || value === 'BOLETO'
    ? value
    : null;
}

function paymentStatus(
  event: string,
  value?: string,
):
  | 'PENDING'
  | 'CONFIRMED'
  | 'RECEIVED'
  | 'OVERDUE'
  | 'REFUNDED'
  | 'CHARGEBACK'
  | 'CANCELED' {
  const candidate = event.startsWith('PAYMENT_')
    ? event.slice('PAYMENT_'.length)
    : value;
  if (
    candidate === 'CONFIRMED' ||
    candidate === 'RECEIVED' ||
    candidate === 'OVERDUE' ||
    candidate === 'REFUNDED'
  )
    return candidate;
  if (
    candidate === 'CHARGEBACK_REQUESTED' ||
    candidate === 'CHARGEBACK_DISPUTE' ||
    candidate === 'CHARGEBACK'
  )
    return 'CHARGEBACK';
  if (candidate === 'DELETED' || candidate === 'CANCELED') return 'CANCELED';
  return 'PENDING';
}

type PaymentStatus = ReturnType<typeof paymentStatus>;

function reconcilePaymentStatus(
  existing: PaymentStatus | undefined,
  incoming: PaymentStatus,
): PaymentStatus {
  if (!existing || existing === incoming) return incoming;
  if (existing === 'REFUNDED' || existing === 'CHARGEBACK') return existing;
  if (incoming === 'REFUNDED' || incoming === 'CHARGEBACK') return incoming;
  if (existing === 'RECEIVED') return existing;
  if (incoming === 'RECEIVED') return incoming;
  if (existing === 'CONFIRMED') return existing;
  if (incoming === 'CONFIRMED') return incoming;
  if (existing === 'CANCELED' && incoming !== 'PENDING') return incoming;
  return existing === 'OVERDUE' && incoming === 'PENDING' ? existing : incoming;
}

function safeInvoiceUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'asaas.com' ||
        url.hostname.endsWith('.asaas.com') ||
        url.hostname.endsWith('.asaas.com.br'))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

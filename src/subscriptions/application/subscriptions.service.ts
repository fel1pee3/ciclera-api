import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import {
  SUBSCRIPTION_PAYMENT_GATEWAY,
  type SubscriptionPaymentGateway,
  type SubscriptionPaymentMethod,
  type PixBillingProfile,
} from './ports/subscription-payment-gateway.port';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRecord,
  type SubscriptionRepository,
} from './ports/subscription.repository';
import {
  SubscriptionChangeInvalidError,
  SubscriptionOwnerRequiredError,
  SubscriptionWebhookUnauthorizedError,
} from '../domain/subscription.errors';
import {
  getSubscriptionPlan,
  subscriptionPlans,
  type SubscriptionPlanCode,
} from '../domain/subscription-plan';

@Injectable()
export class SubscriptionsService {
  private readonly webhookToken: string;
  private readonly enforcementEnabled: boolean;

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(SUBSCRIPTION_PAYMENT_GATEWAY)
    private readonly payments: SubscriptionPaymentGateway,
    config: ConfigService,
  ) {
    this.webhookToken = config.get<string>('ASAAS_WEBHOOK_TOKEN') ?? '';
    this.enforcementEnabled = config.getOrThrow<boolean>(
      'SUBSCRIPTION_ENFORCEMENT_ENABLED',
    );
  }

  plans() {
    return subscriptionPlans;
  }

  async current(principal: AuthenticatedPrincipal) {
    const [subscription, usage] = await Promise.all([
      this.subscriptions.current(principal.organizationId),
      this.subscriptions.usage(principal.organizationId),
    ]);
    return presentSubscription(
      subscription,
      usage,
      this.enforcementEnabled,
      principal.role === 'OWNER',
    );
  }

  async createCheckout(
    principal: AuthenticatedPrincipal,
    requestId: string,
    planCode: SubscriptionPlanCode,
    paymentMethod: SubscriptionPaymentMethod,
    billingProfile?: PixBillingProfile,
  ) {
    this.requireOwner(principal);
    const current = await this.subscriptions.current(principal.organizationId);
    if (current.status === 'ACTIVE' && !current.cancelAtPeriodEnd)
      throw new SubscriptionChangeInvalidError();
    const identity = await this.subscriptions.organizationCheckoutIdentity(
      principal.organizationId,
    );
    if (!identity) throw new SubscriptionChangeInvalidError();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1_000);
    const checkout = await this.subscriptions.createCheckout({
      organizationId: principal.organizationId,
      planCode,
      paymentMethod,
      expiresAt,
      actorUserId: principal.userId,
      requestId,
    });
    const hosted = await this.payments.createHostedCheckout({
      externalReference: checkout.id,
      organizationId: principal.organizationId,
      subscriptionId: checkout.subscriptionId,
      ...identity,
      providerCustomerId: current.providerCustomerId,
      providerSubscriptionId:
        current.paymentMethod === 'PIX' ? current.providerSubscriptionId : null,
      billingProfile,
      plan: getSubscriptionPlan(planCode),
      paymentMethod,
      expiresAt,
    });
    await this.subscriptions.attachProviderCheckout({
      organizationId: principal.organizationId,
      checkoutId: checkout.id,
      providerCheckoutId: hosted.providerId,
      providerCustomerId: hosted.providerCustomerId,
      providerSubscriptionId: hosted.providerSubscriptionId,
      paymentMethod,
      nextDueDate: hosted.nextDueDate,
      initialPayment: hosted.initialPayment,
    });
    return { checkoutUrl: hosted.url, expiresAt };
  }

  async changePlan(
    principal: AuthenticatedPrincipal,
    requestId: string,
    planCode: SubscriptionPlanCode,
  ) {
    this.requireOwner(principal);
    const [current, usage] = await Promise.all([
      this.subscriptions.current(principal.organizationId),
      this.subscriptions.usage(principal.organizationId),
    ]);
    if (
      !current.planCode ||
      current.status !== 'ACTIVE' ||
      !current.providerSubscriptionId ||
      current.planCode === planCode
    ) {
      throw new SubscriptionChangeInvalidError();
    }
    const plan = getSubscriptionPlan(planCode);
    if (
      usage.technicians > plan.maxTechnicians ||
      usage.administrativeUsers > plan.maxAdministrativeUsers ||
      usage.evidenceStorageBytes > BigInt(plan.evidenceStorageBytes)
    ) {
      throw new SubscriptionChangeInvalidError();
    }
    await this.payments.updateSubscription({
      providerSubscriptionId: current.providerSubscriptionId,
      plan,
    });
    return presentSubscription(
      await this.subscriptions.schedulePlanChange({
        organizationId: principal.organizationId,
        planCode,
        actorUserId: principal.userId,
        requestId,
      }),
      usage,
      this.enforcementEnabled,
      true,
    );
  }

  async cancel(principal: AuthenticatedPrincipal, requestId: string) {
    this.requireOwner(principal);
    const current = await this.subscriptions.current(principal.organizationId);
    if (
      !current.providerSubscriptionId ||
      current.cancelAtPeriodEnd ||
      !current.currentPeriodEnd
    ) {
      throw new SubscriptionChangeInvalidError();
    }
    await this.payments.cancelSubscription(current.providerSubscriptionId);
    const [updated, usage] = await Promise.all([
      this.subscriptions.cancelAtPeriodEnd({
        organizationId: principal.organizationId,
        actorUserId: principal.userId,
        requestId,
      }),
      this.subscriptions.usage(principal.organizationId),
    ]);
    return presentSubscription(updated, usage, this.enforcementEnabled, true);
  }

  async webhook(token: string | undefined, payload: unknown) {
    if (!token || !safeEqual(token, this.webhookToken))
      throw new SubscriptionWebhookUnauthorizedError();
    return { status: await this.subscriptions.processWebhook(payload) };
  }

  private requireOwner(principal: AuthenticatedPrincipal) {
    if (principal.role !== 'OWNER') throw new SubscriptionOwnerRequiredError();
  }
}

function presentSubscription(
  subscription: SubscriptionRecord,
  usage: {
    technicians: number;
    administrativeUsers: number;
    evidenceStorageBytes: bigint;
  },
  enforcementEnabled: boolean,
  mayViewBillingLink: boolean,
) {
  const access = subscriptionAccess(subscription);
  return {
    ...subscription,
    providerCustomerId: undefined,
    providerSubscriptionId: undefined,
    enforcementEnabled,
    latestInvoiceUrl: mayViewBillingLink ? subscription.latestInvoiceUrl : null,
    access,
    plan: subscription.planCode
      ? getSubscriptionPlan(subscription.planCode)
      : null,
    scheduledPlan: subscription.scheduledPlanCode
      ? getSubscriptionPlan(subscription.scheduledPlanCode)
      : null,
    usage: {
      ...usage,
      evidenceStorageBytes: Number(usage.evidenceStorageBytes),
    },
  };
}

export function subscriptionAccess(
  subscription: SubscriptionRecord,
  now = new Date(),
): 'FULL' | 'READ_ONLY' {
  if (subscription.status === 'ACTIVE') return 'FULL';
  if (
    subscription.status === 'CANCELED' &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd > now
  )
    return 'FULL';
  if (subscription.status !== 'PAST_DUE' || !subscription.overdueSince)
    return 'READ_ONLY';
  const gracePeriodEndsAt =
    subscription.overdueSince.getTime() + subscriptionGracePeriodMs;
  return now.getTime() < gracePeriodEndsAt ? 'FULL' : 'READ_ONLY';
}

const subscriptionGracePeriodMs = 3 * 86_400_000;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

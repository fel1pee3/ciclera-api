import type { UserRole } from '../../../auth/domain/authenticated-principal';
import type { SubscriptionPaymentMethod } from './subscription-payment-gateway.port';
import type { SubscriptionPlanCode } from '../../domain/subscription-plan';

export const SUBSCRIPTION_REPOSITORY = Symbol('SUBSCRIPTION_REPOSITORY');

export type SubscriptionStatus =
  'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'ENDED';

export interface SubscriptionRecord {
  id: string;
  organizationId: string;
  planCode: SubscriptionPlanCode | null;
  scheduledPlanCode: SubscriptionPlanCode | null;
  status: SubscriptionStatus;
  paymentMethod: SubscriptionPaymentMethod | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  nextDueDate: Date | null;
  overdueSince: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  latestInvoiceUrl: string | null;
}

export interface SubscriptionUsage {
  technicians: number;
  administrativeUsers: number;
  evidenceStorageBytes: bigint;
}

export interface SubscriptionRepository {
  current(organizationId: string): Promise<SubscriptionRecord>;
  usage(organizationId: string): Promise<SubscriptionUsage>;
  organizationCheckoutIdentity(organizationId: string): Promise<{
    organizationName: string;
    ownerName: string;
    ownerEmail: string;
  } | null>;
  createCheckout(input: {
    organizationId: string;
    planCode: SubscriptionPlanCode;
    paymentMethod: SubscriptionPaymentMethod;
    expiresAt: Date;
    actorUserId: string;
    requestId: string;
  }): Promise<{ id: string; subscriptionId: string }>;
  attachProviderCheckout(input: {
    organizationId: string;
    checkoutId: string;
    providerCheckoutId: string;
    providerCustomerId?: string;
    providerSubscriptionId?: string;
    paymentMethod?: SubscriptionPaymentMethod;
    nextDueDate?: Date;
    initialPayment?: {
      providerPaymentId: string;
      status: 'PENDING' | 'OVERDUE';
      amountInCents: number;
      dueDate: Date;
      invoiceUrl: string;
    };
  }): Promise<void>;
  schedulePlanChange(input: {
    organizationId: string;
    planCode: SubscriptionPlanCode;
    actorUserId: string;
    requestId: string;
  }): Promise<SubscriptionRecord>;
  cancelAtPeriodEnd(input: {
    organizationId: string;
    actorUserId: string;
    requestId: string;
  }): Promise<SubscriptionRecord>;
  processWebhook(
    event: unknown,
  ): Promise<'PROCESSED' | 'DUPLICATE' | 'IGNORED'>;
  assertUserSeat(input: {
    organizationId: string;
    role: UserRole;
    activatingExisting?: boolean;
  }): Promise<void>;
  assertEvidenceStorage(input: {
    organizationId: string;
    incomingBytes: number;
  }): Promise<void>;
}

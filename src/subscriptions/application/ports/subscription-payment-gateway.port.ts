import type { SubscriptionPlan } from '../../domain/subscription-plan';

export const SUBSCRIPTION_PAYMENT_GATEWAY = Symbol(
  'SUBSCRIPTION_PAYMENT_GATEWAY',
);

export type SubscriptionPaymentMethod = 'CREDIT_CARD' | 'PIX' | 'BOLETO';

export interface HostedCheckout {
  providerId: string;
  url: string;
}

export interface SubscriptionPaymentGateway {
  createHostedCheckout(input: {
    externalReference: string;
    organizationName: string;
    ownerName: string;
    ownerEmail: string;
    plan: SubscriptionPlan;
    paymentMethod: SubscriptionPaymentMethod;
    expiresAt: Date;
  }): Promise<HostedCheckout>;
  updateSubscription(input: {
    providerSubscriptionId: string;
    plan: SubscriptionPlan;
  }): Promise<void>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
}

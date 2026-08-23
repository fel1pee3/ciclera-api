import type { SubscriptionPlan } from '../../domain/subscription-plan';

export const SUBSCRIPTION_PAYMENT_GATEWAY = Symbol(
  'SUBSCRIPTION_PAYMENT_GATEWAY',
);

export type SubscriptionPaymentMethod = 'CREDIT_CARD' | 'PIX' | 'BOLETO';

export interface PixBillingProfile {
  cpfCnpj: string;
  mobilePhone: string;
  postalCode: string;
  address: string;
  addressNumber: string;
  complement?: string;
  province: string;
}

export interface HostedCheckout {
  providerId: string;
  url: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  nextDueDate?: Date;
  initialPayment?: {
    providerPaymentId: string;
    status: 'PENDING' | 'OVERDUE';
    amountInCents: number;
    dueDate: Date;
    invoiceUrl: string;
  };
}

export interface SubscriptionPaymentGateway {
  createHostedCheckout(input: {
    externalReference: string;
    organizationId: string;
    subscriptionId: string;
    organizationName: string;
    ownerName: string;
    ownerEmail: string;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    billingProfile?: PixBillingProfile;
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

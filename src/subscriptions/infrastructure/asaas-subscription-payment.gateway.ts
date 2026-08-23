import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type {
  HostedCheckout,
  SubscriptionPaymentGateway,
} from '../application/ports/subscription-payment-gateway.port';
import { SubscriptionCheckoutUnavailableError } from '../domain/subscription.errors';

const hostedCheckoutResponseSchema = z
  .object({
    id: z.string().optional(),
    link: z.string().url().optional(),
    url: z.string().url().optional(),
    checkoutUrl: z.string().url().optional(),
    paymentLink: z
      .union([
        z.string(),
        z.object({
          id: z.string().optional(),
          url: z.string().url().optional(),
        }),
      ])
      .optional(),
  })
  .passthrough();

const asaasCustomerSchema = z.object({ id: z.string().min(1) }).passthrough();
const asaasSubscriptionSchema = z
  .object({
    id: z.string().min(1),
    customer: z.string().min(1),
    nextDueDate: z.string(),
  })
  .passthrough();
const asaasPaymentSchema = z
  .object({
    id: z.string().min(1),
    status: z.string(),
    value: z.number().nonnegative(),
    dueDate: z.string(),
    invoiceUrl: z.string().url().nullable().optional(),
    bankSlipUrl: z.string().url().nullable().optional(),
  })
  .passthrough();
const listResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: z.array(item) }).passthrough();

type CheckoutInput = Parameters<
  SubscriptionPaymentGateway['createHostedCheckout']
>[0];

@Injectable()
export class AsaasSubscriptionPaymentGateway implements SubscriptionPaymentGateway {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly webUrl: string;

  constructor(config: ConfigService) {
    this.apiUrl = config.getOrThrow<string>('ASAAS_API_URL').replace(/\/$/, '');
    this.apiKey = config.getOrThrow<string>('ASAAS_API_KEY');
    this.webUrl = config.getOrThrow<string>('WEB_URL');
  }

  async createHostedCheckout(input: CheckoutInput): Promise<HostedCheckout> {
    if (input.paymentMethod === 'PIX') return this.createPixSubscription(input);

    const callbackUrls = this.callbackUrls();
    const amount = input.plan.priceInCents / 100;
    const isBoleto = input.paymentMethod === 'BOLETO';
    const payload = isBoleto
      ? {
          name: `Ciclera — Plano ${input.plan.name}`,
          description: 'Assinatura mensal da plataforma Ciclera',
          value: amount,
          billingType: 'BOLETO',
          chargeType: 'RECURRENT',
          subscriptionCycle: 'MONTHLY',
          dueDateLimitDays: 5,
          externalReference: input.externalReference,
          notificationEnabled: true,
          isAddressRequired: true,
          callback: {
            successUrl: callbackUrls.successUrl,
            autoRedirect: true,
          },
        }
      : {
          billingTypes: [input.paymentMethod],
          chargeTypes: ['RECURRENT'],
          minutesToExpire: checkoutExpirationMinutes(input.expiresAt),
          externalReference: input.externalReference,
          callback: callbackUrls,
          items: [
            {
              name: `Ciclera — Plano ${input.plan.name}`,
              description: 'Assinatura mensal da plataforma Ciclera',
              quantity: 1,
              value: amount,
            },
          ],
          subscription: {
            cycle: 'MONTHLY',
            nextDueDate: formatAsaasDateTime(new Date()),
          },
        };

    const response = await this.request(
      isBoleto ? '/paymentLinks' : '/checkouts',
      { method: 'POST', body: JSON.stringify(payload) },
    );
    return parseHostedCheckout(response);
  }

  async updateSubscription(
    input: Parameters<SubscriptionPaymentGateway['updateSubscription']>[0],
  ) {
    await this.request(
      `/subscriptions/${encodeURIComponent(input.providerSubscriptionId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          value: input.plan.priceInCents / 100,
          cycle: 'MONTHLY',
          updatePendingPayments: false,
        }),
      },
    );
  }

  async cancelSubscription(providerSubscriptionId: string) {
    await this.request(
      `/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,
      { method: 'DELETE' },
    );
  }

  private async createPixSubscription(
    input: CheckoutInput,
  ): Promise<HostedCheckout> {
    if (!input.billingProfile) throw new SubscriptionCheckoutUnavailableError();

    const customerId = await this.resolvePixCustomer(input);
    const subscription = await this.resolvePixSubscription(input, customerId);
    const payment = await this.resolvePixPayment(subscription.id);
    const invoiceUrl = payment.invoiceUrl ?? payment.bankSlipUrl;
    if (!invoiceUrl || !isAllowedAsaasUrl(invoiceUrl)) {
      throw new SubscriptionCheckoutUnavailableError();
    }
    const dueDate = parseAsaasDate(payment.dueDate);
    const nextDueDate = parseAsaasDate(subscription.nextDueDate);
    if (!dueDate || !nextDueDate) {
      throw new SubscriptionCheckoutUnavailableError();
    }

    return {
      providerId: subscription.id,
      url: invoiceUrl,
      providerCustomerId: customerId,
      providerSubscriptionId: subscription.id,
      nextDueDate,
      initialPayment: {
        providerPaymentId: payment.id,
        status: payment.status === 'OVERDUE' ? 'OVERDUE' : 'PENDING',
        amountInCents: Math.round(payment.value * 100),
        dueDate,
        invoiceUrl,
      },
    };
  }

  private async resolvePixCustomer(input: CheckoutInput): Promise<string> {
    if (input.providerCustomerId) return input.providerCustomerId;

    const listed = listResponseSchema(asaasCustomerSchema).safeParse(
      await this.request(
        `/customers?externalReference=${encodeURIComponent(input.organizationId)}&limit=1`,
        { method: 'GET' },
      ),
    );
    if (!listed.success) throw new SubscriptionCheckoutUnavailableError();
    const existing = listed.data.data[0];
    if (existing) return existing.id;

    const profile = input.billingProfile;
    if (!profile) throw new SubscriptionCheckoutUnavailableError();
    const created = asaasCustomerSchema.safeParse(
      await this.request('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: input.organizationName,
          cpfCnpj: onlyDigits(profile.cpfCnpj),
          email: input.ownerEmail,
          mobilePhone: localBrazilPhone(profile.mobilePhone),
          postalCode: onlyDigits(profile.postalCode),
          address: profile.address.trim(),
          addressNumber: profile.addressNumber.trim(),
          complement: profile.complement?.trim() || undefined,
          province: profile.province.trim(),
          externalReference: input.organizationId,
          notificationDisabled: false,
        }),
      }),
    );
    if (!created.success) throw new SubscriptionCheckoutUnavailableError();
    return created.data.id;
  }

  private async resolvePixSubscription(
    input: CheckoutInput,
    customerId: string,
  ): Promise<z.infer<typeof asaasSubscriptionSchema>> {
    let subscriptionId = input.providerSubscriptionId;
    if (!subscriptionId) {
      const listed = listResponseSchema(asaasSubscriptionSchema).safeParse(
        await this.request(
          `/subscriptions?externalReference=${encodeURIComponent(input.subscriptionId)}&limit=1`,
          { method: 'GET' },
        ),
      );
      if (!listed.success) throw new SubscriptionCheckoutUnavailableError();
      subscriptionId = listed.data.data[0]?.id;
    }

    const amount = input.plan.priceInCents / 100;
    if (subscriptionId) {
      const updated = asaasSubscriptionSchema.safeParse(
        await this.request(
          `/subscriptions/${encodeURIComponent(subscriptionId)}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              value: amount,
              billingType: 'PIX',
              cycle: 'MONTHLY',
              updatePendingPayments: true,
            }),
          },
        ),
      );
      if (!updated.success) throw new SubscriptionCheckoutUnavailableError();
      return updated.data;
    }

    const created = asaasSubscriptionSchema.safeParse(
      await this.request('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          customer: customerId,
          billingType: 'PIX',
          value: amount,
          nextDueDate: formatAsaasDate(new Date()),
          cycle: 'MONTHLY',
          description: `Ciclera — Plano ${input.plan.name}`,
          externalReference: input.subscriptionId,
          callback: {
            successUrl: this.callbackUrls().successUrl,
            autoRedirect: true,
          },
        }),
      }),
    );
    if (!created.success) throw new SubscriptionCheckoutUnavailableError();
    return created.data;
  }

  private async resolvePixPayment(
    subscriptionId: string,
  ): Promise<z.infer<typeof asaasPaymentSchema>> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parsed = listResponseSchema(asaasPaymentSchema).safeParse(
        await this.request(
          `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`,
          { method: 'GET' },
        ),
      );
      if (!parsed.success) throw new SubscriptionCheckoutUnavailableError();
      const payable = parsed.data.data.find(
        (payment) =>
          payment.status === 'PENDING' || payment.status === 'OVERDUE',
      );
      if (payable) return payable;
      if (attempt < 2) await delay(250);
    }
    throw new SubscriptionCheckoutUnavailableError();
  }

  private callbackUrls() {
    return {
      successUrl: `${this.webUrl}/app/assinatura?retorno=sucesso`,
      cancelUrl: `${this.webUrl}/app/assinatura?retorno=cancelado`,
      expiredUrl: `${this.webUrl}/app/assinatura?retorno=expirado`,
    };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(10_000),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          access_token: this.apiKey,
          'user-agent': 'Ciclera/1.0',
        },
      });
    } catch {
      throw new SubscriptionCheckoutUnavailableError();
    }
    if (!response.ok) throw new SubscriptionCheckoutUnavailableError();
    if (response.status === 204) return {};
    try {
      return await response.json();
    } catch {
      throw new SubscriptionCheckoutUnavailableError();
    }
  }
}

function parseHostedCheckout(response: unknown): HostedCheckout {
  const parsed = hostedCheckoutResponseSchema.safeParse(response);
  if (!parsed.success) throw new SubscriptionCheckoutUnavailableError();
  const paymentLink = parsed.data.paymentLink;
  const providerId =
    parsed.data.id ??
    (typeof paymentLink === 'string' ? paymentLink : paymentLink?.id);
  const url =
    parsed.data.link ??
    parsed.data.url ??
    parsed.data.checkoutUrl ??
    (typeof paymentLink === 'object' ? paymentLink.url : undefined) ??
    (typeof paymentLink === 'string' && paymentLink.startsWith('https://')
      ? paymentLink
      : undefined);
  if (!providerId || !url || !isAllowedAsaasUrl(url)) {
    throw new SubscriptionCheckoutUnavailableError();
  }
  return { providerId, url };
}

function checkoutExpirationMinutes(expiresAt: Date) {
  return Math.max(
    10,
    Math.min(1440, Math.round((expiresAt.getTime() - Date.now()) / 60_000)),
  );
}

function formatAsaasDateTime(value: Date): string {
  const parts = dateParts(value, true);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatAsaasDate(value: Date): string {
  const parts = dateParts(value, false);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateParts(value: Date, withTime: boolean) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime
      ? {
          hour: '2-digit' as const,
          minute: '2-digit' as const,
          second: '2-digit' as const,
          hour12: false,
        }
      : {}),
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  };
}

function parseAsaasDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function localBrazilPhone(value: string) {
  const digits = onlyDigits(value);
  return digits.startsWith('55') && digits.length >= 12
    ? digits.slice(2)
    : digits;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function isAllowedAsaasUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'asaas.com' ||
        url.hostname.endsWith('.asaas.com') ||
        url.hostname.endsWith('.asaas.com.br'))
    );
  } catch {
    return false;
  }
}

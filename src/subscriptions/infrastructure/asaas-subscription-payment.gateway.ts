import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type {
  HostedCheckout,
  SubscriptionPaymentGateway,
} from '../application/ports/subscription-payment-gateway.port';
import { SubscriptionCheckoutUnavailableError } from '../domain/subscription.errors';

const responseSchema = z
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

  async createHostedCheckout(
    input: Parameters<SubscriptionPaymentGateway['createHostedCheckout']>[0],
  ): Promise<HostedCheckout> {
    const callbackUrls = {
      successUrl: `${this.webUrl}/app/assinatura?retorno=sucesso`,
      cancelUrl: `${this.webUrl}/app/assinatura?retorno=cancelado`,
      expiredUrl: `${this.webUrl}/app/assinatura?retorno=expirado`,
    };
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
          minutesToExpire: Math.max(
            10,
            Math.min(
              1440,
              Math.round((input.expiresAt.getTime() - Date.now()) / 60_000),
            ),
          ),
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
          customerData: {
            name: input.ownerName,
            email: input.ownerEmail,
          },
          subscription: {
            cycle: 'MONTHLY',
            nextDueDate: formatAsaasDateTime(new Date()),
          },
        };

    const response = await this.request(
      isBoleto ? '/paymentLinks' : '/checkouts',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    const parsed = responseSchema.safeParse(response);
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

function formatAsaasDateTime(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
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

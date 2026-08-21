import type { ConfigService } from '@nestjs/config';
import { getSubscriptionPlan } from '../domain/subscription-plan';
import { SubscriptionCheckoutUnavailableError } from '../domain/subscription.errors';
import { AsaasSubscriptionPaymentGateway } from './asaas-subscription-payment.gateway';

describe('AsaasSubscriptionPaymentGateway', () => {
  const fetchMock = jest.fn();
  let gateway: AsaasSubscriptionPaymentGateway;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-21T15:00:00.000Z'));
    fetchMock.mockReset();
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
    const values: Record<string, string> = {
      ASAAS_API_URL: 'https://api-sandbox.asaas.com/v3',
      ASAAS_API_KEY: '$aact_local_secret_never_exposed',
      WEB_URL: 'https://ciclera.example',
    };
    const config = {
      getOrThrow: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    gateway = new AsaasSubscriptionPaymentGateway(config);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('creates a recurring hosted checkout with server-owned price and safe callbacks', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'checkout-id',
          link: 'https://sandbox.asaas.com/checkoutSession/show/checkout-id',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      gateway.createHostedCheckout({
        externalReference: 'internal-checkout-id',
        organizationName: 'Empresa Teste',
        ownerName: 'Pessoa Proprietária',
        ownerEmail: 'owner@example.test',
        plan: getSubscriptionPlan('ESSENTIAL'),
        paymentMethod: 'CREDIT_CARD',
        expiresAt: new Date('2026-08-21T16:00:00.000Z'),
      }),
    ).resolves.toEqual({
      providerId: 'checkout-id',
      url: 'https://sandbox.asaas.com/checkoutSession/show/checkout-id',
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    if (typeof request.body !== 'string') {
      throw new Error('Expected a JSON request body.');
    }
    const body: unknown = JSON.parse(request.body);
    expect(body).toMatchObject({
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: ['RECURRENT'],
      externalReference: 'internal-checkout-id',
      subscription: {
        cycle: 'MONTHLY',
        nextDueDate: '2026-08-21 12:00:00',
      },
      callback: {
        successUrl: 'https://ciclera.example/app/assinatura?retorno=sucesso',
        cancelUrl: 'https://ciclera.example/app/assinatura?retorno=cancelado',
        expiredUrl: 'https://ciclera.example/app/assinatura?retorno=expirado',
      },
      items: [expect.objectContaining({ value: 199 })],
    });
    expect(JSON.stringify(body)).not.toContain('$aact_local_secret');
    expect(request.headers).toMatchObject({
      access_token: '$aact_local_secret_never_exposed',
    });
  });

  it('rejects a checkout URL outside an Asaas HTTPS host', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'checkout-id', link: 'https://evil.example/pay' }),
        { status: 200 },
      ),
    );

    await expect(
      gateway.createHostedCheckout({
        externalReference: 'internal-checkout-id',
        organizationName: 'Empresa Teste',
        ownerName: 'Pessoa Proprietária',
        ownerEmail: 'owner@example.test',
        plan: getSubscriptionPlan('ESSENTIAL'),
        paymentMethod: 'PIX',
        expiresAt: new Date('2026-08-21T16:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(SubscriptionCheckoutUnavailableError);
  });
});

import type { ConfigService } from '@nestjs/config';
import { SubscriptionCheckoutUnavailableError } from '../domain/subscription.errors';
import { getSubscriptionPlan } from '../domain/subscription-plan';
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
      jsonResponse({
        id: 'checkout-id',
        link: 'https://sandbox.asaas.com/checkoutSession/show/checkout-id',
      }),
    );

    await expect(
      gateway.createHostedCheckout({
        ...checkoutInput,
        plan: getSubscriptionPlan('ESSENTIAL'),
        paymentMethod: 'CREDIT_CARD',
        expiresAt: new Date('2026-08-21T16:00:00.000Z'),
      }),
    ).resolves.toEqual({
      providerId: 'checkout-id',
      url: 'https://sandbox.asaas.com/checkoutSession/show/checkout-id',
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body: unknown = JSON.parse(request.body as string);
    expect(body).toMatchObject({
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: ['RECURRENT'],
      externalReference: checkoutInput.externalReference,
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
    expect(body).not.toHaveProperty('customerData');
    expect(JSON.stringify(body)).not.toContain('$aact_local_secret');
    expect(request.headers).toMatchObject({
      access_token: '$aact_local_secret_never_exposed',
    });
  });

  it('rejects a checkout URL outside an Asaas HTTPS host', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: 'checkout-id', link: 'https://evil.example/pay' }),
    );

    await expect(
      gateway.createHostedCheckout({
        ...checkoutInput,
        plan: getSubscriptionPlan('ESSENTIAL'),
        paymentMethod: 'CREDIT_CARD',
        expiresAt: new Date('2026-08-21T16:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(SubscriptionCheckoutUnavailableError);
  });

  it('creates a monthly Pix subscription and returns its first manual payment', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'cus_123' }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'sub_123',
          customer: 'cus_123',
          nextDueDate: '2026-08-21',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: 'pay_123',
              status: 'PENDING',
              value: 199,
              dueDate: '2026-08-21',
              invoiceUrl: 'https://sandbox.asaas.com/i/pay_123',
            },
          ],
        }),
      );

    await expect(
      gateway.createHostedCheckout({
        ...checkoutInput,
        plan: getSubscriptionPlan('ESSENTIAL'),
        paymentMethod: 'PIX',
        expiresAt: new Date('2026-08-21T16:00:00.000Z'),
        billingProfile: {
          cpfCnpj: '12345678901',
          mobilePhone: '5511999999999',
          postalCode: '01310100',
          address: 'Avenida Paulista',
          addressNumber: '1578',
          complement: 'Sala 12',
          province: 'Bela Vista',
        },
      }),
    ).resolves.toEqual({
      providerId: 'sub_123',
      url: 'https://sandbox.asaas.com/i/pay_123',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      nextDueDate: new Date('2026-08-21T00:00:00.000Z'),
      initialPayment: {
        providerPaymentId: 'pay_123',
        status: 'PENDING',
        amountInCents: 19_900,
        dueDate: new Date('2026-08-21T00:00:00.000Z'),
        invoiceUrl: 'https://sandbox.asaas.com/i/pay_123',
      },
    });

    const [, customerRequest] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(customerRequest.body as string)).toMatchObject({
      cpfCnpj: '12345678901',
      mobilePhone: '11999999999',
      externalReference: checkoutInput.organizationId,
    });
    const [, subscriptionRequest] = fetchMock.mock.calls[3] as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(subscriptionRequest.body as string)).toMatchObject({
      customer: 'cus_123',
      billingType: 'PIX',
      cycle: 'MONTHLY',
      externalReference: checkoutInput.subscriptionId,
      value: 199,
    });
  });

  it('reuses the existing Pix customer and subscription without duplicating them', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'sub_existing',
          customer: 'cus_existing',
          nextDueDate: '2026-08-21',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: 'pay_existing',
              status: 'PENDING',
              value: 399,
              dueDate: '2026-08-21',
              invoiceUrl: 'https://www.asaas.com/i/pay_existing',
            },
          ],
        }),
      );

    await gateway.createHostedCheckout({
      ...checkoutInput,
      providerCustomerId: 'cus_existing',
      providerSubscriptionId: 'sub_existing',
      plan: getSubscriptionPlan('PROFESSIONAL'),
      paymentMethod: 'PIX',
      expiresAt: new Date('2026-08-21T16:00:00.000Z'),
      billingProfile: {
        cpfCnpj: '12345678901',
        mobilePhone: '5511999999999',
        postalCode: '01310100',
        address: 'Avenida Paulista',
        addressNumber: '1578',
        province: 'Bela Vista',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [updateUrl, updateRequest] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const [paymentsUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(updateUrl).toBe(
      'https://api-sandbox.asaas.com/v3/subscriptions/sub_existing',
    );
    expect(updateRequest).toMatchObject({ method: 'PUT' });
    expect(paymentsUrl).toBe(
      'https://api-sandbox.asaas.com/v3/subscriptions/sub_existing/payments',
    );
  });
});

const checkoutInput = {
  externalReference: '22222222-2222-4222-8222-222222222222',
  organizationId: '11111111-1111-4111-8111-111111111111',
  subscriptionId: '33333333-3333-4333-8333-333333333333',
  organizationName: 'Empresa Teste',
  ownerName: 'Pessoa Proprietária',
  ownerEmail: 'owner@example.test',
  providerCustomerId: null,
  providerSubscriptionId: null,
};

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

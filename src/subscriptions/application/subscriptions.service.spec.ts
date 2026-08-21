import type { ConfigService } from '@nestjs/config';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import {
  SubscriptionChangeInvalidError,
  SubscriptionOwnerRequiredError,
  SubscriptionWebhookUnauthorizedError,
} from '../domain/subscription.errors';
import type { SubscriptionPaymentGateway } from './ports/subscription-payment-gateway.port';
import type {
  SubscriptionRecord,
  SubscriptionRepository,
} from './ports/subscription.repository';
import {
  SubscriptionsService,
  subscriptionAccess,
} from './subscriptions.service';

describe('SubscriptionsService', () => {
  let repository: jest.Mocked<SubscriptionRepository>;
  let gateway: jest.Mocked<SubscriptionPaymentGateway>;
  let service: SubscriptionsService;

  beforeEach(() => {
    repository = {
      current: jest.fn().mockResolvedValue(subscription()),
      usage: jest.fn().mockResolvedValue({
        technicians: 0,
        administrativeUsers: 1,
        evidenceStorageBytes: 0n,
      }),
      organizationCheckoutIdentity: jest.fn().mockResolvedValue({
        organizationName: 'Empresa Teste',
        ownerName: 'Pessoa Proprietária',
        ownerEmail: 'owner@example.test',
      }),
      createCheckout: jest.fn().mockResolvedValue({ id: checkoutId }),
      attachProviderCheckout: jest.fn(),
      schedulePlanChange: jest.fn(),
      cancelAtPeriodEnd: jest.fn(),
      processWebhook: jest.fn().mockResolvedValue('PROCESSED'),
      assertUserSeat: jest.fn(),
      assertEvidenceStorage: jest.fn(),
    };
    gateway = {
      createHostedCheckout: jest.fn().mockResolvedValue({
        providerId: 'checkout-provider-id',
        url: 'https://sandbox.asaas.com/checkoutSession/show/test',
      }),
      updateSubscription: jest.fn(),
      cancelSubscription: jest.fn(),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'ASAAS_WEBHOOK_TOKEN' ? webhookToken : undefined,
      ),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'SUBSCRIPTION_ENFORCEMENT_ENABLED') return true;
        throw new Error(`Unexpected config key: ${key}`);
      }),
    } as unknown as ConfigService;
    service = new SubscriptionsService(repository, gateway, config);
  });

  it('returns billing links only to the organization owner', async () => {
    repository.current.mockResolvedValue(
      subscription({
        status: 'PAST_DUE',
        planCode: 'ESSENTIAL',
        latestInvoiceUrl: 'https://www.asaas.com/i/local-only',
      }),
    );

    await expect(service.current(owner)).resolves.toMatchObject({
      enforcementEnabled: true,
      latestInvoiceUrl: 'https://www.asaas.com/i/local-only',
    });
    await expect(service.current(admin)).resolves.toMatchObject({
      latestInvoiceUrl: null,
    });
  });

  it('creates hosted checkout with the server-owned plan and price', async () => {
    const result = await service.createCheckout(
      owner,
      'request-id',
      'PROFESSIONAL',
      'CREDIT_CARD',
    );

    expect(result.checkoutUrl).toContain('sandbox.asaas.com');
    expect(gateway.createHostedCheckout.mock.calls).toHaveLength(1);
    expect(gateway.createHostedCheckout.mock.calls[0]?.[0]).toMatchObject({
      externalReference: checkoutId,
      paymentMethod: 'CREDIT_CARD',
      plan: {
        code: 'PROFESSIONAL',
        priceInCents: 39_900,
      },
    });
    expect(repository.attachProviderCheckout.mock.calls[0]?.[0]).toEqual({
      organizationId,
      checkoutId,
      providerCheckoutId: 'checkout-provider-id',
    });
  });

  it('does not allow non-owners to manage payment', async () => {
    await expect(
      service.createCheckout(admin, 'request-id', 'ESSENTIAL', 'PIX'),
    ).rejects.toBeInstanceOf(SubscriptionOwnerRequiredError);
    expect(gateway.createHostedCheckout.mock.calls).toHaveLength(0);
  });

  it('blocks a downgrade when current usage exceeds its limits', async () => {
    repository.current.mockResolvedValue(
      subscription({
        status: 'ACTIVE',
        planCode: 'OPERATION',
        providerSubscriptionId: 'sub_123',
      }),
    );
    repository.usage.mockResolvedValue({
      technicians: 6,
      administrativeUsers: 1,
      evidenceStorageBytes: 0n,
    });

    await expect(
      service.changePlan(owner, 'request-id', 'ESSENTIAL'),
    ).rejects.toBeInstanceOf(SubscriptionChangeInvalidError);
    expect(gateway.updateSubscription.mock.calls).toHaveLength(0);
  });

  it('authenticates webhook tokens with exact constant-time comparison', async () => {
    await expect(service.webhook('wrong-token', {})).rejects.toBeInstanceOf(
      SubscriptionWebhookUnauthorizedError,
    );
    await expect(service.webhook(webhookToken, { id: 'evt' })).resolves.toEqual(
      { status: 'PROCESSED' },
    );
  });
});

describe('subscriptionAccess', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');

  it('has no trial and keeps an unpaid new organization read-only', () => {
    expect(subscriptionAccess(subscription(), now)).toBe('READ_ONLY');
  });

  it.each([
    [7, 'FULL'],
    [8, 'LIMITED'],
    [15, 'LIMITED'],
    [16, 'READ_ONLY'],
  ] as const)('maps day %s overdue to %s access', (days, expected) => {
    expect(
      subscriptionAccess(
        subscription({
          status: 'PAST_DUE',
          planCode: 'ESSENTIAL',
          overdueSince: new Date(now.getTime() - days * 86_400_000),
        }),
        now,
      ),
    ).toBe(expected);
  });
});

const organizationId = '11111111-1111-4111-8111-111111111111';
const checkoutId = '22222222-2222-4222-8222-222222222222';
const webhookToken = 'local-webhook-token-with-more-than-32-characters';
const owner: AuthenticatedPrincipal = {
  organizationId,
  userId: '33333333-3333-4333-8333-333333333333',
  sessionId: '44444444-4444-4444-8444-444444444444',
  role: 'OWNER',
};
const admin: AuthenticatedPrincipal = { ...owner, role: 'ADMIN' };

function subscription(
  overrides: Partial<SubscriptionRecord> = {},
): SubscriptionRecord {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    organizationId,
    planCode: null,
    scheduledPlanCode: null,
    status: 'PENDING',
    paymentMethod: null,
    providerSubscriptionId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    nextDueDate: null,
    overdueSince: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    latestInvoiceUrl: null,
    ...overrides,
  };
}

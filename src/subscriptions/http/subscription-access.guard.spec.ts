import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { setAuthenticatedPrincipal } from '../../auth/http/authenticated-request';
import type { SubscriptionEntitlementsService } from '../application/subscription-entitlements.service';
import type {
  SubscriptionRecord,
  SubscriptionRepository,
} from '../application/ports/subscription.repository';
import {
  SubscriptionAccessRestrictedError,
  SubscriptionRequiredError,
} from '../domain/subscription.errors';
import { SubscriptionAccessGuard } from './subscription-access.guard';

describe('SubscriptionAccessGuard', () => {
  const organizationId = '11111111-1111-4111-8111-111111111111';
  let repository: Pick<SubscriptionRepository, 'current'>;
  let reflector: Pick<Reflector, 'getAllAndOverride'>;

  beforeEach(() => {
    repository = { current: jest.fn().mockResolvedValue(subscription()) };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
  });

  it('blocks operational reads while the organization has never activated a plan', async () => {
    const guard = createGuard(reflector, repository, true);

    await expect(
      guard.canActivate(contextFor('GET', '/api/v1/customers')),
    ).rejects.toBeInstanceOf(SubscriptionRequiredError);
  });

  it.each(['GET', 'POST'])(
    'blocks %s access after the three-day grace period',
    async (method) => {
      repository.current = jest.fn().mockResolvedValue(
        subscription({
          planCode: 'ESSENTIAL',
          status: 'PAST_DUE',
          overdueSince: new Date(Date.now() - 3 * 86_400_000),
        }),
      );
      const guard = createGuard(reflector, repository, true);

      await expect(
        guard.canActivate(contextFor(method, '/api/v1/customers')),
      ).rejects.toBeInstanceOf(SubscriptionAccessRestrictedError);
    },
  );

  it('keeps operational access during the three-day grace period', async () => {
    repository.current = jest.fn().mockResolvedValue(
      subscription({
        planCode: 'ESSENTIAL',
        status: 'PAST_DUE',
        overdueSince: new Date(Date.now() - 2 * 86_400_000),
      }),
    );
    const guard = createGuard(reflector, repository, true);

    await expect(
      guard.canActivate(contextFor('POST', '/api/v1/customers')),
    ).resolves.toBe(true);
  });

  it('keeps CORS preflight independent from authentication and subscription state', async () => {
    const guard = createGuard(reflector, repository, true);

    await expect(
      guard.canActivate(contextFor('OPTIONS', '/api/v1/customers', false)),
    ).resolves.toBe(true);
    expect(repository.current).not.toHaveBeenCalled();
  });

  it('does not enforce subscriptions when billing enforcement is disabled', async () => {
    const guard = createGuard(reflector, repository, false);

    await expect(
      guard.canActivate(contextFor('GET', '/api/v1/customers', false)),
    ).resolves.toBe(true);
    expect(repository.current).not.toHaveBeenCalled();
  });

  function createGuard(
    metadata: Pick<Reflector, 'getAllAndOverride'>,
    subscriptions: Pick<SubscriptionRepository, 'current'>,
    enforcementEnabled: boolean,
  ) {
    return new SubscriptionAccessGuard(
      metadata as Reflector,
      subscriptions as SubscriptionRepository,
      { enforcementEnabled } as SubscriptionEntitlementsService,
    );
  }

  function contextFor(method: string, path: string, authenticated = true) {
    const request = { method, path };
    if (authenticated) {
      setAuthenticatedPrincipal(request as never, {
        organizationId,
        userId: '22222222-2222-4222-8222-222222222222',
        sessionId: '33333333-3333-4333-8333-333333333333',
        role: 'OWNER',
      });
    }
    return {
      getHandler: () => contextFor,
      getClass: () => SubscriptionAccessGuard,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function subscription(
    overrides: Partial<SubscriptionRecord> = {},
  ): SubscriptionRecord {
    return {
      id: '44444444-4444-4444-8444-444444444444',
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
});

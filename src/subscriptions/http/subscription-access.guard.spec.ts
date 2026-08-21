import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { setAuthenticatedPrincipal } from '../../auth/http/authenticated-request';
import type { SubscriptionEntitlementsService } from '../application/subscription-entitlements.service';
import type {
  SubscriptionRecord,
  SubscriptionRepository,
} from '../application/ports/subscription.repository';
import { SubscriptionRequiredError } from '../domain/subscription.errors';
import {
  isAllowedFieldCompletionWrite,
  SubscriptionAccessGuard,
} from './subscription-access.guard';

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

  it('preserves operational reads for a previously subscribed read-only organization', async () => {
    repository.current = jest
      .fn()
      .mockResolvedValue(
        subscription({ planCode: 'ESSENTIAL', status: 'ENDED' }),
      );
    const guard = createGuard(reflector, repository, true);

    await expect(
      guard.canActivate(contextFor('GET', '/api/v1/customers')),
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

describe('limited subscription field writes', () => {
  const order = '11111111-1111-4111-8111-111111111111';
  const evidence = '22222222-2222-4222-8222-222222222222';

  it.each([
    ['PATCH', `/api/v1/field/work-orders/${order}/execution`],
    ['POST', `/api/v1/field/work-orders/${order}/submit-for-review`],
    ['POST', `/api/v1/field/work-orders/${order}/resume-correction`],
    ['POST', `/api/v1/field/work-orders/${order}/execution/additional-items`],
    [
      'DELETE',
      `/api/v1/field/work-orders/${order}/execution/additional-items/${evidence}`,
    ],
    ['POST', `/api/v1/field/work-orders/${order}/execution/evidence/intents`],
    ['PUT', `/api/v1/field/evidence/${evidence}/upload`],
    [
      'POST',
      `/api/v1/field/work-orders/${order}/execution/evidence/${evidence}/confirm`,
    ],
  ])('allows %s %s to finish ongoing field work', (method, path) => {
    expect(isAllowedFieldCompletionWrite(method, path)).toBe(true);
  });

  it.each([
    ['POST', `/api/v1/field/work-orders/${order}/start`],
    ['POST', '/api/v1/work-orders'],
    ['PATCH', '/api/v1/customers/11111111-1111-4111-8111-111111111111'],
  ])('blocks %s %s from starting or changing other work', (method, path) => {
    expect(isAllowedFieldCompletionWrite(method, path)).toBe(false);
  });
});

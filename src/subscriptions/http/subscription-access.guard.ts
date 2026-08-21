import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { publicRouteMetadataKey } from '../../auth/http/public.decorator';
import {
  getAuthenticatedPrincipal,
  type AuthenticatedRequest,
} from '../../auth/http/authenticated-request';
import {
  SubscriptionAccessRestrictedError,
  SubscriptionRequiredError,
} from '../domain/subscription.errors';
import { subscriptionAccess } from '../application/subscriptions.service';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../application/ports/subscription.repository';
import { SubscriptionEntitlementsService } from '../application/subscription-entitlements.service';
import { subscriptionExemptMetadataKey } from './subscription-exempt.decorator';

@Injectable()
export class SubscriptionAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    private readonly entitlements: SubscriptionEntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (!this.entitlements.enforcementEnabled) return true;
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(publicRouteMetadataKey, targets)
    )
      return true;
    if (
      this.reflector.getAllAndOverride<boolean>(
        subscriptionExemptMetadataKey,
        targets,
      )
    )
      return true;

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & Request>();
    if (request.method === 'OPTIONS') return true;

    const principal = getAuthenticatedPrincipal(request);
    const subscription = await this.subscriptions.current(
      principal.organizationId,
    );
    if (!subscription.planCode) throw new SubscriptionRequiredError();
    const access = subscriptionAccess(subscription);
    if (access === 'FULL') return true;
    throw new SubscriptionAccessRestrictedError();
  }
}

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
  SubscriptionRequiredError,
  SubscriptionWriteRestrictedError,
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
    if (
      request.method === 'GET' ||
      request.method === 'HEAD' ||
      request.method === 'OPTIONS'
    )
      return true;
    const principal = getAuthenticatedPrincipal(request);
    const subscription = await this.subscriptions.current(
      principal.organizationId,
    );
    if (!subscription.planCode) throw new SubscriptionRequiredError();
    const access = subscriptionAccess(subscription);
    if (access === 'FULL') return true;
    if (
      access === 'LIMITED' &&
      principal.role === 'TECHNICIAN' &&
      isAllowedFieldCompletionWrite(request.method, request.path)
    ) {
      return true;
    }
    throw new SubscriptionWriteRestrictedError();
  }
}

export function isAllowedFieldCompletionWrite(
  method: string,
  path: string,
): boolean {
  const normalizedMethod = method.toUpperCase();
  const segments = path.split('/').filter(Boolean);
  const isWorkOrderPath =
    segments[0] === 'api' &&
    segments[1] === 'v1' &&
    segments[2] === 'field' &&
    segments[3] === 'work-orders' &&
    isUuidPathSegment(segments[4]);

  if (
    isWorkOrderPath &&
    normalizedMethod === 'PATCH' &&
    segments.length === 6 &&
    segments[5] === 'execution'
  ) {
    return true;
  }
  if (
    isWorkOrderPath &&
    normalizedMethod === 'POST' &&
    segments.length === 6 &&
    (segments[5] === 'submit-for-review' || segments[5] === 'resume-correction')
  ) {
    return true;
  }
  if (
    isWorkOrderPath &&
    ['POST', 'PATCH', 'DELETE'].includes(normalizedMethod) &&
    segments[5] === 'execution' &&
    segments[6] === 'additional-items' &&
    (segments.length === 7 ||
      (segments.length === 8 && isUuidPathSegment(segments[7])))
  ) {
    return true;
  }
  const isEvidenceIntent =
    isWorkOrderPath &&
    normalizedMethod === 'POST' &&
    segments.length === 8 &&
    segments[5] === 'execution' &&
    segments[6] === 'evidence' &&
    segments[7] === 'intents';
  const isEvidenceConfirmationOrRemoval =
    isWorkOrderPath &&
    ['POST', 'DELETE'].includes(normalizedMethod) &&
    segments[5] === 'execution' &&
    segments[6] === 'evidence' &&
    isUuidPathSegment(segments[7]) &&
    ((normalizedMethod === 'POST' &&
      segments.length === 9 &&
      segments[8] === 'confirm') ||
      (normalizedMethod === 'DELETE' && segments.length === 8));
  const isEvidenceUpload =
    normalizedMethod === 'PUT' &&
    segments.length === 6 &&
    segments[0] === 'api' &&
    segments[1] === 'v1' &&
    segments[2] === 'field' &&
    segments[3] === 'evidence' &&
    isUuidPathSegment(segments[4]) &&
    segments[5] === 'upload';
  return (
    isEvidenceIntent || isEvidenceConfirmationOrRemoval || isEvidenceUpload
  );
}

function isUuidPathSegment(value: string | undefined): boolean {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );
}

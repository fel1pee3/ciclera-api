export class SubscriptionOwnerRequiredError extends Error {}
export class SubscriptionRequiredError extends Error {}
export class SubscriptionWriteRestrictedError extends Error {}
export class SubscriptionLimitExceededError extends Error {
  constructor(
    public readonly limit:
      'ADMINISTRATIVE_USERS' | 'TECHNICIANS' | 'EVIDENCE_STORAGE',
  ) {
    super('Subscription limit exceeded.');
  }
}
export class SubscriptionCheckoutUnavailableError extends Error {}
export class SubscriptionChangeInvalidError extends Error {}
export class SubscriptionWebhookUnauthorizedError extends Error {}
export class SubscriptionWebhookInvalidError extends Error {}

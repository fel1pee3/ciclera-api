import { SetMetadata } from '@nestjs/common';

export const subscriptionExemptMetadataKey = 'subscription:exempt';
export const SubscriptionExempt = (): MethodDecorator & ClassDecorator =>
  SetMetadata(subscriptionExemptMetadataKey, true);

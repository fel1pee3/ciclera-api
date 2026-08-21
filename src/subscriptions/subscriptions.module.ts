import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { SubscriptionEntitlementsService } from './application/subscription-entitlements.service';
import { SubscriptionsService } from './application/subscriptions.service';
import {
  SUBSCRIPTION_PAYMENT_GATEWAY,
  type SubscriptionPaymentGateway,
} from './application/ports/subscription-payment-gateway.port';
import { SUBSCRIPTION_REPOSITORY } from './application/ports/subscription.repository';
import { SubscriptionCheckoutUnavailableError } from './domain/subscription.errors';
import { AsaasSubscriptionPaymentGateway } from './infrastructure/asaas-subscription-payment.gateway';
import { PrismaSubscriptionRepository } from './infrastructure/prisma-subscription.repository';
import { SubscriptionAccessGuard } from './http/subscription-access.guard';
import {
  AsaasWebhookController,
  SubscriptionsController,
} from './http/subscriptions.controller';

class DisabledSubscriptionPaymentGateway implements SubscriptionPaymentGateway {
  createHostedCheckout(): Promise<never> {
    throw new SubscriptionCheckoutUnavailableError();
  }
  updateSubscription(): Promise<never> {
    throw new SubscriptionCheckoutUnavailableError();
  }
  cancelSubscription(): Promise<never> {
    throw new SubscriptionCheckoutUnavailableError();
  }
}

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [SubscriptionsController, AsaasWebhookController],
  providers: [
    SubscriptionsService,
    SubscriptionEntitlementsService,
    SubscriptionAccessGuard,
    { provide: APP_GUARD, useExisting: SubscriptionAccessGuard },
    {
      provide: SUBSCRIPTION_REPOSITORY,
      useClass: PrismaSubscriptionRepository,
    },
    {
      provide: SUBSCRIPTION_PAYMENT_GATEWAY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.getOrThrow<boolean>('SUBSCRIPTION_ENFORCEMENT_ENABLED')
          ? new AsaasSubscriptionPaymentGateway(config)
          : new DisabledSubscriptionPaymentGateway(),
    },
  ],
  exports: [SubscriptionEntitlementsService, SUBSCRIPTION_REPOSITORY],
})
export class SubscriptionsModule {}

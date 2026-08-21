import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import {
  subscriptionPlanCodes,
  type SubscriptionPlanCode,
} from '../domain/subscription-plan';
import type { SubscriptionPaymentMethod } from '../application/ports/subscription-payment-gateway.port';

export class CreateSubscriptionCheckoutDto {
  @ApiProperty({ enum: subscriptionPlanCodes })
  @IsIn(subscriptionPlanCodes)
  planCode!: SubscriptionPlanCode;

  @ApiProperty({ enum: ['CREDIT_CARD', 'PIX', 'BOLETO'] })
  @IsIn(['CREDIT_CARD', 'PIX', 'BOLETO'])
  paymentMethod!: SubscriptionPaymentMethod;
}

export class ChangeSubscriptionPlanDto {
  @ApiProperty({ enum: subscriptionPlanCodes })
  @IsIn(subscriptionPlanCodes)
  planCode!: SubscriptionPlanCode;
}

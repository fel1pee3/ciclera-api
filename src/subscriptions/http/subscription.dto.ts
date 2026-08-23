import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  subscriptionPlanCodes,
  type SubscriptionPlanCode,
} from '../domain/subscription-plan';
import type { SubscriptionPaymentMethod } from '../application/ports/subscription-payment-gateway.port';

export class SubscriptionPaymentsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 10;
}

export class PixBillingProfileDto {
  @ApiProperty({ description: 'CPF ou CNPJ, somente dígitos' })
  @Matches(/^(?:\d{11}|\d{14})$/)
  cpfCnpj!: string;

  @ApiProperty({ description: 'Telefone brasileiro, somente dígitos' })
  @Matches(/^\d{10,13}$/)
  mobilePhone!: string;

  @ApiProperty({ description: 'CEP, somente dígitos' })
  @Matches(/^\d{8}$/)
  postalCode!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  address!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20)
  addressNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  complement?: string;

  @ApiProperty({ description: 'Bairro' })
  @IsString()
  @MaxLength(80)
  province!: string;
}

export class CreateSubscriptionCheckoutDto {
  @ApiProperty({ enum: subscriptionPlanCodes })
  @IsIn(subscriptionPlanCodes)
  planCode!: SubscriptionPlanCode;

  @ApiProperty({ enum: ['CREDIT_CARD', 'PIX', 'BOLETO'] })
  @IsIn(['CREDIT_CARD', 'PIX', 'BOLETO'])
  paymentMethod!: SubscriptionPaymentMethod;

  @ApiPropertyOptional({ type: PixBillingProfileDto })
  @ValidateIf(
    (input: CreateSubscriptionCheckoutDto) => input.paymentMethod === 'PIX',
  )
  @IsDefined()
  @ValidateNested()
  @Type(() => PixBillingProfileDto)
  billingProfile?: PixBillingProfileDto;
}

export class ChangeSubscriptionPlanDto {
  @ApiProperty({ enum: subscriptionPlanCodes })
  @IsIn(subscriptionPlanCodes)
  planCode!: SubscriptionPlanCode;
}

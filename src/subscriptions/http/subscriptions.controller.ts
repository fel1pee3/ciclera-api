import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Public } from '../../auth/http/public.decorator';
import { getRequestId, type RequestWithId } from '../../http/request-id';
import { SubscriptionsService } from '../application/subscriptions.service';
import {
  ChangeSubscriptionPlanDto,
  CreateSubscriptionCheckoutDto,
} from './subscription.dto';
import { SubscriptionExempt } from './subscription-exempt.decorator';

@ApiTags('subscriptions')
@SubscriptionExempt()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Lista os planos comerciais vigentes' })
  plans() {
    return { items: this.subscriptions.plans() };
  }

  @Get('current')
  @ApiOperation({
    summary: 'Consulta assinatura, acesso e consumo da organização',
  })
  current(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.subscriptions.current(principal);
  }

  @Post('checkout')
  @ApiOperation({
    summary:
      'Cria um checkout hospedado sem expor dados de pagamento à Ciclera',
  })
  checkout(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Body() input: CreateSubscriptionCheckoutDto,
  ) {
    return this.subscriptions.createCheckout(
      principal,
      getRequestId(request),
      input.planCode,
      input.paymentMethod,
    );
  }

  @Post('change-plan')
  @ApiOperation({ summary: 'Agenda a troca do plano para o próximo ciclo' })
  changePlan(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Body() input: ChangeSubscriptionPlanDto,
  ) {
    return this.subscriptions.changePlan(
      principal,
      getRequestId(request),
      input.planCode,
    );
  }

  @Post('cancel')
  @ApiOperation({
    summary: 'Cancela a renovação e preserva acesso até o fim do ciclo pago',
  })
  cancel(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
  ) {
    return this.subscriptions.cancel(principal, getRequestId(request));
  }
}

@ApiTags('webhooks')
@Public()
@SubscriptionExempt()
@Controller('webhooks/asaas')
export class AsaasWebhookController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recebe eventos autenticados e idempotentes do Asaas',
  })
  webhook(
    @Headers('asaas-access-token') token: string | undefined,
    @Body() payload: unknown,
  ) {
    return this.subscriptions.webhook(token, payload);
  }
}

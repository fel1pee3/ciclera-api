import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { accessCookieName } from '../../auth/http/auth-cookies';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Roles } from '../../auth/http/roles.decorator';
import { getRequestId, type RequestWithId } from '../../http/request-id';
import { formatWorkOrderNumber } from '../../work-orders/domain/work-order';
import { BillingService } from '../application/billing.service';
import { BillingReadyQueryDto, MarkBilledDto } from './billing.dto';

@ApiTags('billing')
@ApiCookieAuth(accessCookieName)
@Roles('OWNER', 'ADMIN')
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('billing/ready')
  @Header('Cache-Control', 'no-store')
  async listReady(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: BillingReadyQueryDto,
  ) {
    const result = await this.billing.listReady(principal, {
      page: query.page,
      pageSize: query.pageSize,
      customerId: query.customerId,
      completedFrom: query.completedFrom
        ? new Date(query.completedFrom)
        : undefined,
      completedTo: query.completedTo ? new Date(query.completedTo) : undefined,
      minimumAgingDays: query.minimumAgingDays,
      minimumAmountInCents: query.minimumAmountInCents
        ? BigInt(query.minimumAmountInCents)
        : undefined,
      maximumAmountInCents: query.maximumAmountInCents
        ? BigInt(query.maximumAmountInCents)
        : undefined,
    });
    return {
      ...result,
      totalAmountInCents: result.totalAmountInCents.toString(),
      items: result.items.map((item) => ({
        ...item,
        number: formatWorkOrderNumber(item.number),
        finalAmountInCents: item.finalAmountInCents.toString(),
      })),
    };
  }

  @Post('work-orders/:workOrderId/mark-billed')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  markBilled(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Body() input: MarkBilledDto,
  ) {
    return this.billing.markBilled(
      principal,
      getRequestId(request),
      workOrderId,
      input.version,
    );
  }
}

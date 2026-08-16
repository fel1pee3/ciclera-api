import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { accessCookieName } from '../../auth/http/auth-cookies';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Roles } from '../../auth/http/roles.decorator';
import { formatWorkOrderNumber } from '../../work-orders/domain/work-order';
import { DashboardService } from '../application/dashboard.service';
import { DashboardSummaryQueryDto } from './dashboard.dto';

@ApiTags('dashboard')
@ApiCookieAuth(accessCookieName)
@Roles('OWNER', 'ADMIN')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  async summary(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: DashboardSummaryQueryDto,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const from = query.from ?? firstDayOfMonth(today);
    const to = query.to ?? today;
    const result = await this.dashboard.summary(principal, { from, to });
    return {
      ...result,
      stages: Object.fromEntries(
        Object.entries(result.stages).map(([status, value]) => [
          status,
          { ...value, amountInCents: value.amountInCents.toString() },
        ]),
      ),
      blockedAmountInCents: result.blockedAmountInCents.toString(),
      oldestBlocked: result.oldestBlocked.map((order) => ({
        ...order,
        number: formatWorkOrderNumber(order.number),
      })),
    };
  }
}

function firstDayOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`;
}

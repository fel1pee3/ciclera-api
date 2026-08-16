import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { accessCookieName } from '../../auth/http/auth-cookies';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Roles } from '../../auth/http/roles.decorator';
import { HistoryService } from '../application/history.service';

@ApiTags('work-orders')
@ApiCookieAuth(accessCookieName)
@Roles('OWNER', 'ADMIN')
@Controller('work-orders')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get(':workOrderId/history')
  @Header('Cache-Control', 'no-store')
  find(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
  ) {
    return this.history.find(principal, workOrderId);
  }
}

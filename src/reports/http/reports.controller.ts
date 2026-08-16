import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiCookieAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { accessCookieName } from '../../auth/http/auth-cookies';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Roles } from '../../auth/http/roles.decorator';
import { ServiceReportService } from '../application/service-report.service';

@ApiTags('reports')
@ApiCookieAuth(accessCookieName)
@Roles('OWNER', 'ADMIN')
@Controller('work-orders')
export class ReportsController {
  constructor(private readonly reports: ServiceReportService) {}

  @Get(':workOrderId/service-report.pdf')
  @Throttle({ ip: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store')
  @ApiProduces('application/pdf')
  async serviceReport(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Res() response: Response,
  ) {
    const report = await this.reports.generate(principal, workOrderId);
    response.type('application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.fileName}"`,
    );
    response.send(report.content);
  }
}

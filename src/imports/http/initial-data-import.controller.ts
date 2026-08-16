import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiCookieAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { accessCookieName } from '../../auth/http/auth-cookies';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Roles } from '../../auth/http/roles.decorator';
import { getRequestId, type RequestWithId } from '../../http/request-id';
import { InitialDataImportService } from '../application/initial-data-import.service';
import {
  CommitInitialDataImportDto,
  PreviewInitialDataImportDto,
} from './initial-data-import.dto';

@ApiTags('imports')
@ApiCookieAuth(accessCookieName)
@Roles('OWNER')
@Controller('imports/initial-data')
export class InitialDataImportController {
  constructor(private readonly imports: InitialDataImportService) {}

  @Get('template.csv')
  @Header('Cache-Control', 'private, no-store')
  @ApiProduces('text/csv')
  template(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.type('text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="modelo-importacao-inicial.csv"',
    );
    return new StreamableFile(Buffer.from(this.imports.template(principal)));
  }

  @Post('preview')
  @Header('Cache-Control', 'no-store')
  preview(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: PreviewInitialDataImportDto,
  ) {
    return this.imports.preview(principal, input.content);
  }

  @Post('commit')
  @Header('Cache-Control', 'no-store')
  commit(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Body() input: CommitInitialDataImportDto,
  ) {
    return this.imports.commit(principal, getRequestId(request), input);
  }
}

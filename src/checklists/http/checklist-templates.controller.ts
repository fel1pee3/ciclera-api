import { Body, Controller, Get, Header, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { accessCookieName } from '../../auth/http/auth-cookies';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Roles } from '../../auth/http/roles.decorator';
import { getRequestId, type RequestWithId } from '../../http/request-id';
import { ChecklistTemplatesService } from '../application/checklist-templates.service';
import {
  ChecklistTemplateResponseDto,
  CreateChecklistTemplateVersionDto,
} from './checklist-template.dto';

@ApiTags('checklist-templates')
@ApiCookieAuth(accessCookieName)
@Roles('OWNER', 'ADMIN')
@Controller('checklist-templates')
export class ChecklistTemplatesController {
  constructor(private readonly templates: ChecklistTemplatesService) {}

  @Get('current')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ChecklistTemplateResponseDto, nullable: true })
  current(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.templates.current(principal);
  }

  @Post('versions')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ChecklistTemplateResponseDto })
  createVersion(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Body() input: CreateChecklistTemplateVersionDto,
  ) {
    return this.templates.createVersion(
      principal,
      getRequestId(request),
      input,
    );
  }
}

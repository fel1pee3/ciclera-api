import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { accessCookieName } from '../../auth/http/auth-cookies';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Roles } from '../../auth/http/roles.decorator';
import { EvidenceService } from '../application/evidence.service';
import { EvidenceTokenQueryDto } from './evidence.dto';

@ApiTags('review-evidence')
@ApiCookieAuth(accessCookieName)
@Roles('OWNER', 'ADMIN')
@Controller('reviews/evidence')
export class ReviewEvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Get(':evidenceId/read-url')
  @Header('Cache-Control', 'no-store')
  readUrl(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('evidenceId', new ParseUUIDPipe()) evidenceId: string,
  ) {
    return this.evidence.readUrlForManager(principal, evidenceId);
  }

  @Get(':evidenceId/content')
  @Header('Cache-Control', 'private, no-store')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async read(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('evidenceId', new ParseUUIDPipe()) evidenceId: string,
    @Query() query: EvidenceTokenQueryDto,
    @Res() response: Response,
  ) {
    const result = await this.evidence.readForManager(
      principal,
      evidenceId,
      query.token,
    );
    response.type(result.record.contentType).send(result.content);
  }
}

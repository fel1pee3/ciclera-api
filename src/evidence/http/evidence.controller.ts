import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { accessCookieName } from '../../auth/http/auth-cookies';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Roles } from '../../auth/http/roles.decorator';
import { getRequestId, type RequestWithId } from '../../http/request-id';
import { toTechnicianWorkOrderResponse } from '../../work-orders/http/technician-work-order.presenter';
import { EvidenceService } from '../application/evidence.service';
import {
  CreateEvidenceIntentDto,
  EvidenceTokenQueryDto,
  EvidenceVersionDto,
} from './evidence.dto';

@ApiTags('field-evidence')
@ApiCookieAuth(accessCookieName)
@Roles('TECHNICIAN')
@Controller('field')
export class EvidenceController {
  private readonly maxSize: number;

  constructor(
    private readonly evidence: EvidenceService,
    config: ConfigService,
  ) {
    this.maxSize = config.getOrThrow<number>('UPLOAD_MAX_FILE_SIZE_BYTES');
  }

  @Post('work-orders/:workOrderId/execution/evidence/intents')
  @ApiOkResponse({
    description: 'Intent privado e ordem com versão atualizada.',
  })
  async createIntent(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Body() input: CreateEvidenceIntentDto,
  ) {
    const result = await this.evidence.createIntent(
      principal,
      getRequestId(request),
      workOrderId,
      input,
    );
    return {
      ...result,
      workOrder: toTechnicianWorkOrderResponse(result.workOrder),
    };
  }

  @Put('evidence/:evidenceId/upload')
  @HttpCode(HttpStatus.NO_CONTENT)
  async upload(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('evidenceId', new ParseUUIDPipe()) evidenceId: string,
    @Query() query: EvidenceTokenQueryDto,
    @Req() request: Request,
  ) {
    const content = await readBoundedBody(request, this.maxSize);
    await this.evidence.upload(
      principal,
      evidenceId,
      query.token,
      request.headers['content-type'] ?? '',
      content,
    );
  }

  @Post('work-orders/:workOrderId/execution/evidence/:evidenceId/confirm')
  @ApiOkResponse({ description: 'Evidência confirmada e ordem atualizada.' })
  async confirm(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Param('evidenceId', new ParseUUIDPipe()) evidenceId: string,
    @Body() input: EvidenceVersionDto,
  ) {
    return toTechnicianWorkOrderResponse(
      await this.evidence.confirm(
        principal,
        getRequestId(request),
        workOrderId,
        evidenceId,
        input.version,
      ),
    );
  }

  @Get('evidence/:evidenceId/read-url')
  @Header('Cache-Control', 'no-store')
  readUrl(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('evidenceId', new ParseUUIDPipe()) evidenceId: string,
  ) {
    return this.evidence.readUrl(principal, evidenceId);
  }

  @Get('evidence/:evidenceId/content')
  @Header('Cache-Control', 'private, no-store')
  async read(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('evidenceId', new ParseUUIDPipe()) evidenceId: string,
    @Query() query: EvidenceTokenQueryDto,
    @Res() response: Response,
  ) {
    const result = await this.evidence.read(principal, evidenceId, query.token);
    response.type(result.record.contentType).send(result.content);
  }

  @Delete('work-orders/:workOrderId/execution/evidence/:evidenceId')
  @ApiOkResponse({ description: 'Evidência removida e ordem atualizada.' })
  async remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Param('evidenceId', new ParseUUIDPipe()) evidenceId: string,
    @Body() input: EvidenceVersionDto,
  ) {
    return toTechnicianWorkOrderResponse(
      await this.evidence.remove(
        principal,
        getRequestId(request),
        workOrderId,
        evidenceId,
        input.version,
      ),
    );
  }
}

async function readBoundedBody(
  request: Request,
  maxSize: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as Uint8Array);
    size += buffer.byteLength;
    if (size > maxSize) throw new PayloadTooLargeException();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

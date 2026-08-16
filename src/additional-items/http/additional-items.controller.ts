import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { accessCookieName } from '../../auth/http/auth-cookies';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Roles } from '../../auth/http/roles.decorator';
import { getRequestId, type RequestWithId } from '../../http/request-id';
import { AdditionalItemsService } from '../application/additional-items.service';
import {
  AdditionalItemInputDto,
  AdditionalItemVersionDto,
} from './additional-item.dto';

@ApiTags('field-additional-items')
@ApiCookieAuth(accessCookieName)
@Roles('TECHNICIAN')
@Controller('field/work-orders/:workOrderId/execution/additional-items')
export class AdditionalItemsController {
  constructor(private readonly items: AdditionalItemsService) {}

  @Post()
  @ApiOkResponse({
    description: 'Item criado e ordem com total oficial atualizado.',
  })
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Body() input: AdditionalItemInputDto,
  ) {
    return this.items.create(
      principal,
      getRequestId(request),
      workOrderId,
      input,
    );
  }

  @Patch(':itemId')
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() input: AdditionalItemInputDto,
  ) {
    return this.items.update(
      principal,
      getRequestId(request),
      workOrderId,
      itemId,
      input,
    );
  }

  @Delete(':itemId')
  remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() input: AdditionalItemVersionDto,
  ) {
    return this.items.remove(
      principal,
      getRequestId(request),
      workOrderId,
      itemId,
      input.version,
    );
  }
}

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
import { toTechnicianWorkOrderResponse } from '../../work-orders/http/technician-work-order.presenter';
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
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Body() input: AdditionalItemInputDto,
  ) {
    return toTechnicianWorkOrderResponse(
      await this.items.create(
        principal,
        getRequestId(request),
        workOrderId,
        input,
      ),
    );
  }

  @Patch(':itemId')
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() input: AdditionalItemInputDto,
  ) {
    return toTechnicianWorkOrderResponse(
      await this.items.update(
        principal,
        getRequestId(request),
        workOrderId,
        itemId,
        input,
      ),
    );
  }

  @Delete(':itemId')
  async remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() input: AdditionalItemVersionDto,
  ) {
    return toTechnicianWorkOrderResponse(
      await this.items.remove(
        principal,
        getRequestId(request),
        workOrderId,
        itemId,
        input.version,
      ),
    );
  }
}

import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { accessCookieName } from '../../auth/http/auth-cookies';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Roles } from '../../auth/http/roles.decorator';
import { getRequestId, type RequestWithId } from '../../http/request-id';
import { WorkOrdersService } from '../application/work-orders.service';
import {
  CancelDraftDto,
  ListWorkOrdersQueryDto,
  UpdateWorkOrderDto,
  WorkOrderDetailsResponseDto,
  WorkOrderInputDto,
  WorkOrderPageResponseDto,
} from './work-order.dto';
import {
  toWorkOrderDetailsResponse,
  toWorkOrderResponse,
} from './work-order.response';

@ApiTags('work-orders')
@ApiCookieAuth(accessCookieName)
@Roles('OWNER', 'ADMIN')
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: WorkOrderPageResponseDto })
  async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Query() query: ListWorkOrdersQueryDto,
  ): Promise<WorkOrderPageResponseDto> {
    const page = await this.workOrders.list(context(principal, request), query);
    return { ...page, items: page.items.map(toWorkOrderResponse) };
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: WorkOrderDetailsResponseDto })
  @ApiConflictResponse({ description: 'Relação ou estado inválido.' })
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Body() input: WorkOrderInputDto,
  ): Promise<WorkOrderDetailsResponseDto> {
    return toWorkOrderDetailsResponse(
      await this.workOrders.create(context(principal, request), input),
    );
  }

  @Get(':workOrderId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: WorkOrderDetailsResponseDto })
  @ApiNotFoundResponse({ description: 'Ordem não encontrada no tenant.' })
  async find(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
  ): Promise<WorkOrderDetailsResponseDto> {
    return toWorkOrderDetailsResponse(
      await this.workOrders.find(context(principal, request), workOrderId),
    );
  }

  @Patch(':workOrderId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: WorkOrderDetailsResponseDto })
  @ApiConflictResponse({ description: 'Status ou versão incompatível.' })
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Body() input: UpdateWorkOrderDto,
  ): Promise<WorkOrderDetailsResponseDto> {
    const { version, ...fields } = input;
    return toWorkOrderDetailsResponse(
      await this.workOrders.update(
        context(principal, request),
        workOrderId,
        version,
        fields,
      ),
    );
  }

  @Post(':workOrderId/cancel')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: WorkOrderDetailsResponseDto })
  @ApiConflictResponse({
    description: 'Somente rascunhos podem ser cancelados.',
  })
  async cancelDraft(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Body() input: CancelDraftDto,
  ): Promise<WorkOrderDetailsResponseDto> {
    return toWorkOrderDetailsResponse(
      await this.workOrders.cancelDraft(
        context(principal, request),
        workOrderId,
        input.version,
        input.reason,
      ),
    );
  }
}

function context(principal: AuthenticatedPrincipal, request: RequestWithId) {
  return { principal, requestId: getRequestId(request) };
}

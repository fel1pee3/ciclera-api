import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  Body,
  Req,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { accessCookieName } from '../../auth/http/auth-cookies';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Roles } from '../../auth/http/roles.decorator';
import { getRequestId, type RequestWithId } from '../../http/request-id';
import { TechnicianWorkOrdersService } from '../application/technician-work-orders.service';
import { formatWorkOrderNumber } from '../domain/work-order';
import {
  TechnicianWorkOrderPageDto,
  TechnicianWorkOrderQueryDto,
  TechnicianWorkOrderResponseDto,
  StartWorkOrderExecutionDto,
  UpdateWorkOrderExecutionDto,
} from './technician-work-order.dto';

@ApiTags('field-work-orders')
@ApiCookieAuth(accessCookieName)
@Roles('TECHNICIAN')
@Controller('field/work-orders')
export class TechnicianWorkOrdersController {
  constructor(private readonly workOrders: TechnicianWorkOrdersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: TechnicianWorkOrderPageDto })
  async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: TechnicianWorkOrderQueryDto,
  ): Promise<TechnicianWorkOrderPageDto> {
    const result = await this.workOrders.list(principal, query);
    return { ...result, items: result.items.map(toResponse) };
  }

  @Get(':workOrderId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: TechnicianWorkOrderResponseDto })
  @ApiNotFoundResponse({ description: 'Ordem não atribuída ao técnico.' })
  async find(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
  ): Promise<TechnicianWorkOrderResponseDto> {
    return toResponse(await this.workOrders.find(principal, workOrderId));
  }

  @Post(':workOrderId/start')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: TechnicianWorkOrderResponseDto })
  async start(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Body() input: StartWorkOrderExecutionDto,
  ): Promise<TechnicianWorkOrderResponseDto> {
    return toResponse(
      await this.workOrders.start(
        principal,
        getRequestId(request),
        workOrderId,
        input.version,
      ),
    );
  }

  @Patch(':workOrderId/execution')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: TechnicianWorkOrderResponseDto })
  async updateExecution(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Body() input: UpdateWorkOrderExecutionDto,
  ): Promise<TechnicianWorkOrderResponseDto> {
    return toResponse(
      await this.workOrders.updateExecution(
        principal,
        getRequestId(request),
        workOrderId,
        input.version,
        input.notes,
      ),
    );
  }
}

function toResponse(
  workOrder: Awaited<ReturnType<TechnicianWorkOrdersService['find']>>,
): TechnicianWorkOrderResponseDto {
  return { ...workOrder, number: formatWorkOrderNumber(workOrder.number) };
}

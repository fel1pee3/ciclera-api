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
import { EquipmentService } from '../application/equipment.service';
import {
  EquipmentInputDto,
  EquipmentPageResponseDto,
  EquipmentResponseDto,
  ListEquipmentQueryDto,
  UpdateEquipmentDto,
} from './equipment.dto';

@ApiTags('equipment')
@ApiCookieAuth(accessCookieName)
@Roles('OWNER', 'ADMIN')
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: EquipmentPageResponseDto })
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Query() query: ListEquipmentQueryDto,
  ): Promise<EquipmentPageResponseDto> {
    return this.equipment.list(context(principal, request), query);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: EquipmentResponseDto })
  @ApiConflictResponse({ description: 'Serial ou relação inválida.' })
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Body() input: EquipmentInputDto,
  ): Promise<EquipmentResponseDto> {
    return this.equipment.create(context(principal, request), input);
  }

  @Get(':equipmentId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: EquipmentResponseDto })
  @ApiNotFoundResponse({ description: 'Equipamento não encontrado no tenant.' })
  find(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('equipmentId', new ParseUUIDPipe()) equipmentId: string,
  ): Promise<EquipmentResponseDto> {
    return this.equipment.find(context(principal, request), equipmentId);
  }

  @Patch(':equipmentId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: EquipmentResponseDto })
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('equipmentId', new ParseUUIDPipe()) equipmentId: string,
    @Body() input: UpdateEquipmentDto,
  ): Promise<EquipmentResponseDto> {
    return this.equipment.update(
      context(principal, request),
      equipmentId,
      input,
    );
  }

  @Post(':equipmentId/archive')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: EquipmentResponseDto })
  archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('equipmentId', new ParseUUIDPipe()) equipmentId: string,
  ): Promise<EquipmentResponseDto> {
    return this.equipment.archive(context(principal, request), equipmentId);
  }
}

function context(principal: AuthenticatedPrincipal, request: RequestWithId) {
  return { principal, requestId: getRequestId(request) };
}

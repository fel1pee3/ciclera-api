import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { RequestWithId } from '../../http/request-id';
import { getRequestId } from '../../http/request-id';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { accessCookieName } from '../../auth/http/auth-cookies';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Roles } from '../../auth/http/roles.decorator';
import { UsersService } from '../application/users.service';
import {
  CreateUserDto,
  ListUsersQueryDto,
  PaginatedUsersResponseDto,
  UpdateUserDto,
  UserResponseDto,
} from './user.dto';

@ApiTags('users')
@ApiCookieAuth(accessCookieName)
@Roles('OWNER', 'ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Lista a equipe da organização autenticada.' })
  @ApiOkResponse({ type: PaginatedUsersResponseDto })
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Query() query: ListUsersQueryDto,
  ): Promise<PaginatedUsersResponseDto> {
    return this.users.list(context(principal, request), query);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Cria um usuário na organização autenticada.' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({ description: 'E-mail já utilizado.' })
  @ApiForbiddenResponse({ description: 'Perfil não permitido ao ator.' })
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Body() input: CreateUserDto,
  ): Promise<UserResponseDto> {
    return this.users.create(context(principal, request), input);
  }

  @Get(':userId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'Usuário não encontrado no tenant.' })
  find(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<UserResponseDto> {
    return this.users.find(context(principal, request), userId);
  }

  @Patch(':userId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Altera nome ou perfil conforme a política.' })
  @ApiOkResponse({ type: UserResponseDto })
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() input: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.users.update(context(principal, request), userId, input);
  }

  @Post(':userId/deactivate')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Desativa o usuário e revoga suas sessões.' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiConflictResponse({ description: 'O último OWNER deve permanecer ativo.' })
  deactivate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<UserResponseDto> {
    return this.users.setStatus(
      context(principal, request),
      userId,
      'INACTIVE',
    );
  }

  @Post(':userId/activate')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Reativa um usuário da organização.' })
  @ApiOkResponse({ type: UserResponseDto })
  activate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<UserResponseDto> {
    return this.users.setStatus(context(principal, request), userId, 'ACTIVE');
  }
}

function context(principal: AuthenticatedPrincipal, request: RequestWithId) {
  return { principal, requestId: getRequestId(request) };
}

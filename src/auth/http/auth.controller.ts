import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from '../application/auth.service';
import type { AuthenticatedPrincipal } from '../domain/authenticated-principal';
import { AllowedOriginGuard } from './allowed-origin.guard';
import {
  accessCookieName,
  AuthCookieService,
  readCookie,
  refreshCookieName,
} from './auth-cookies';
import { AuthenticatedAccountResponseDto } from './auth-response.dto';
import { CurrentPrincipal } from './current-principal.decorator';
import { LoginRequestDto } from './login-request.dto';
import { Public } from './public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Post('login')
  @Public()
  @UseGuards(AllowedOriginGuard, ThrottlerGuard)
  @Throttle({
    ip: { limit: 50, ttl: 60_000 },
    identifier: { limit: 10, ttl: 60_000 },
  })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Autentica um usuário ativo.' })
  @ApiOkResponse({ type: AuthenticatedAccountResponseDto })
  @ApiUnauthorizedResponse({ description: 'Credenciais inválidas.' })
  async login(
    @Body() input: LoginRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedAccountResponseDto> {
    const authentication = await this.auth.login(input.email, input.password);
    this.cookies.write(response, authentication);
    return authentication.account;
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @ApiCookieAuth(accessCookieName)
  @ApiOkResponse({ type: AuthenticatedAccountResponseDto })
  @ApiUnauthorizedResponse({ description: 'Sessão inválida.' })
  me(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<AuthenticatedAccountResponseDto> {
    return this.auth.currentAccount(principal);
  }

  @Post('refresh')
  @Public()
  @UseGuards(AllowedOriginGuard, ThrottlerGuard)
  @Throttle({
    ip: { limit: 50, ttl: 60_000 },
    identifier: { limit: 10, ttl: 60_000 },
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @ApiNoContentResponse({ description: 'Cookies rotacionados.' })
  @ApiUnauthorizedResponse({ description: 'Sessão inválida.' })
  async refresh(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const authentication = await this.auth.refresh(
      readCookie(cookieHeader, refreshCookieName),
    );
    this.cookies.write(response, authentication);
  }

  @Post('logout')
  @Public()
  @UseGuards(AllowedOriginGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @ApiNoContentResponse({ description: 'Sessão atual encerrada.' })
  async logout(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    try {
      await this.auth.logout(readCookie(cookieHeader, refreshCookieName));
    } finally {
      this.cookies.clear(response);
    }
  }

  @Post('logout-all')
  @UseGuards(AllowedOriginGuard)
  @ApiCookieAuth(accessCookieName)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @ApiNoContentResponse({ description: 'Todas as sessões foram encerradas.' })
  async logoutAll(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    try {
      await this.auth.logoutAll(principal);
    } finally {
      this.cookies.clear(response);
    }
  }
}

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
import { CustomersService } from '../application/customers.service';
import {
  CustomerInputDto,
  CustomerPageResponseDto,
  CustomerResponseDto,
  ListCustomersQueryDto,
  ListLocationsQueryDto,
  LocationInputDto,
  LocationPageResponseDto,
  LocationResponseDto,
  UpdateCustomerDto,
  UpdateLocationDto,
} from './customer.dto';

@ApiTags('customers')
@ApiCookieAuth(accessCookieName)
@Roles('OWNER', 'ADMIN')
@Controller()
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('customers')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CustomerPageResponseDto })
  listCustomers(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Query() query: ListCustomersQueryDto,
  ): Promise<CustomerPageResponseDto> {
    return this.customers.listCustomers(context(principal, request), query);
  }

  @Post('customers')
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: CustomerResponseDto })
  @ApiConflictResponse({ description: 'Documento já usado na organização.' })
  createCustomer(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Body() input: CustomerInputDto,
  ): Promise<CustomerResponseDto> {
    return this.customers.createCustomer(context(principal, request), input);
  }

  @Get('customers/:customerId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiNotFoundResponse({ description: 'Cliente não encontrado no tenant.' })
  findCustomer(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
  ): Promise<CustomerResponseDto> {
    return this.customers.findCustomer(context(principal, request), customerId);
  }

  @Patch('customers/:customerId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CustomerResponseDto })
  updateCustomer(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body() input: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    return this.customers.updateCustomer(
      context(principal, request),
      customerId,
      input,
    );
  }

  @Post('customers/:customerId/archive')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CustomerResponseDto })
  archiveCustomer(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
  ): Promise<CustomerResponseDto> {
    return this.customers.archiveCustomer(
      context(principal, request),
      customerId,
    );
  }

  @Get('customers/:customerId/locations')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: LocationPageResponseDto })
  listLocations(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Query() query: ListLocationsQueryDto,
  ): Promise<LocationPageResponseDto> {
    return this.customers.listLocations(
      context(principal, request),
      customerId,
      query,
    );
  }

  @Post('customers/:customerId/locations')
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: LocationResponseDto })
  createLocation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body() input: LocationInputDto,
  ): Promise<LocationResponseDto> {
    return this.customers.createLocation(
      context(principal, request),
      customerId,
      input,
    );
  }

  @Get('locations/:locationId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: LocationResponseDto })
  findLocation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
  ): Promise<LocationResponseDto> {
    return this.customers.findLocation(context(principal, request), locationId);
  }

  @Patch('locations/:locationId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: LocationResponseDto })
  updateLocation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @Body() input: UpdateLocationDto,
  ): Promise<LocationResponseDto> {
    return this.customers.updateLocation(
      context(principal, request),
      locationId,
      input,
    );
  }
}

function context(principal: AuthenticatedPrincipal, request: RequestWithId) {
  return { principal, requestId: getRequestId(request) };
}

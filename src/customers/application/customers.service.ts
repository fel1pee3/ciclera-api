import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import type { ArchiveFilter, LocationStatus } from '../domain/customer';
import {
  ArchivedCustomerError,
  CustomerDocumentConflictError,
  CustomerManagementForbiddenError,
  CustomerNotFoundError,
  ServiceLocationNotFoundError,
} from '../domain/customer.errors';
import {
  digitsOnly,
  displayText,
  normalizedDocument,
  normalizedText,
  optionalText,
} from '../domain/normalization';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
  type LocationWriteData,
} from './ports/customer.repository';

export interface CustomerInput {
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface LocationInput {
  name: string;
  postalCode: string;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  country?: string;
  contactName?: string | null;
  contactPhone?: string | null;
  accessInstructions?: string | null;
  status?: LocationStatus;
}

interface RequestContext {
  principal: AuthenticatedPrincipal;
  requestId: string;
}

@Injectable()
export class CustomersService {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customers: CustomerRepository,
  ) {}

  listCustomers(
    context: RequestContext,
    query: {
      page: number;
      pageSize: number;
      search?: string;
      archive: ArchiveFilter;
    },
  ) {
    this.requireManager(context.principal);
    return this.customers.listCustomers({
      ...query,
      ...(query.search ? { search: normalizedText(query.search) } : {}),
      organizationId: context.principal.organizationId,
    });
  }

  async findCustomer(context: RequestContext, customerId: string) {
    this.requireManager(context.principal);
    const customer = await this.customers.findCustomer(
      context.principal.organizationId,
      customerId,
    );
    if (!customer) throw new CustomerNotFoundError();
    return customer;
  }

  async createCustomer(context: RequestContext, input: CustomerInput) {
    this.requireManager(context.principal);
    const document = digitsOnly(input.document);
    const result = await this.customers.createCustomer({
      ...mutationContext(context),
      name: displayText(input.name),
      normalizedName: normalizedText(input.name),
      document,
      normalizedDocument: normalizedDocument(document),
      email: optionalText(input.email)?.toLowerCase() ?? null,
      phone: digitsOnly(input.phone),
      notes: optionalText(input.notes),
    });
    return resolveCustomer(result);
  }

  async updateCustomer(
    context: RequestContext,
    customerId: string,
    input: Partial<CustomerInput>,
  ) {
    this.requireManager(context.principal);
    const document =
      input.document === undefined ? undefined : digitsOnly(input.document);
    const result = await this.customers.updateCustomer({
      ...mutationContext(context),
      customerId,
      ...(input.name === undefined
        ? {}
        : {
            name: displayText(input.name),
            normalizedName: normalizedText(input.name),
          }),
      ...(document === undefined
        ? {}
        : { document, normalizedDocument: normalizedDocument(document) }),
      ...(input.email === undefined
        ? {}
        : { email: optionalText(input.email)?.toLowerCase() ?? null }),
      ...(input.phone === undefined ? {} : { phone: digitsOnly(input.phone) }),
      ...(input.notes === undefined
        ? {}
        : { notes: optionalText(input.notes) }),
    });
    return resolveCustomer(result);
  }

  async archiveCustomer(context: RequestContext, customerId: string) {
    this.requireManager(context.principal);
    return resolveCustomer(
      await this.customers.archiveCustomer({
        ...mutationContext(context),
        customerId,
      }),
    );
  }

  async reactivateCustomer(context: RequestContext, customerId: string) {
    this.requireManager(context.principal);
    return resolveCustomer(
      await this.customers.reactivateCustomer({
        ...mutationContext(context),
        customerId,
      }),
    );
  }

  async listLocations(
    context: RequestContext,
    customerId: string,
    query: {
      page: number;
      pageSize: number;
      search?: string;
      status?: LocationStatus;
    },
  ) {
    this.requireManager(context.principal);
    const page = await this.customers.listLocations({
      ...query,
      ...(query.search ? { search: normalizedText(query.search) } : {}),
      organizationId: context.principal.organizationId,
      customerId,
    });
    if (!page) throw new CustomerNotFoundError();
    return page;
  }

  async findLocation(context: RequestContext, locationId: string) {
    this.requireManager(context.principal);
    const location = await this.customers.findLocation(
      context.principal.organizationId,
      locationId,
    );
    if (!location) throw new ServiceLocationNotFoundError();
    return location;
  }

  async createLocation(
    context: RequestContext,
    customerId: string,
    input: LocationInput,
  ) {
    this.requireManager(context.principal);
    return resolveLocation(
      await this.customers.createLocation({
        ...mutationContext(context),
        customerId,
        ...locationData(input),
      }),
    );
  }

  async updateLocation(
    context: RequestContext,
    locationId: string,
    input: Partial<LocationInput>,
  ) {
    this.requireManager(context.principal);
    const data = locationPatch(input);
    return resolveLocation(
      await this.customers.updateLocation({
        ...mutationContext(context),
        locationId,
        ...data,
      }),
    );
  }

  private requireManager(principal: AuthenticatedPrincipal): void {
    if (principal.role === 'TECHNICIAN') {
      throw new CustomerManagementForbiddenError();
    }
  }
}

function mutationContext(context: RequestContext) {
  return {
    organizationId: context.principal.organizationId,
    actorUserId: context.principal.userId,
    requestId: context.requestId,
  };
}

function locationData(input: LocationInput): LocationWriteData {
  return {
    name: displayText(input.name),
    normalizedName: normalizedText(input.name),
    postalCode: displayText(input.postalCode),
    street: displayText(input.street),
    number: displayText(input.number),
    complement: optionalText(input.complement),
    neighborhood: displayText(input.neighborhood),
    city: displayText(input.city),
    state: input.state.trim().toUpperCase(),
    country: (input.country ?? 'BR').trim().toUpperCase(),
    contactName: optionalText(input.contactName),
    contactPhone: optionalText(input.contactPhone),
    accessInstructions: optionalText(input.accessInstructions),
    status: input.status ?? 'ACTIVE',
  };
}

function locationPatch(
  input: Partial<LocationInput>,
): Partial<LocationWriteData> {
  return {
    ...(input.name === undefined
      ? {}
      : {
          name: displayText(input.name),
          normalizedName: normalizedText(input.name),
        }),
    ...(input.postalCode === undefined
      ? {}
      : { postalCode: displayText(input.postalCode) }),
    ...(input.street === undefined
      ? {}
      : { street: displayText(input.street) }),
    ...(input.number === undefined
      ? {}
      : { number: displayText(input.number) }),
    ...(input.complement === undefined
      ? {}
      : { complement: optionalText(input.complement) }),
    ...(input.neighborhood === undefined
      ? {}
      : { neighborhood: displayText(input.neighborhood) }),
    ...(input.city === undefined ? {} : { city: displayText(input.city) }),
    ...(input.state === undefined
      ? {}
      : { state: input.state.trim().toUpperCase() }),
    ...(input.country === undefined
      ? {}
      : { country: input.country.trim().toUpperCase() }),
    ...(input.contactName === undefined
      ? {}
      : { contactName: optionalText(input.contactName) }),
    ...(input.contactPhone === undefined
      ? {}
      : { contactPhone: optionalText(input.contactPhone) }),
    ...(input.accessInstructions === undefined
      ? {}
      : { accessInstructions: optionalText(input.accessInstructions) }),
    ...(input.status === undefined ? {} : { status: input.status }),
  };
}

function resolveCustomer(
  result: Awaited<ReturnType<CustomerRepository['createCustomer']>>,
) {
  if (result.status === 'NOT_FOUND') throw new CustomerNotFoundError();
  if (result.status === 'DOCUMENT_CONFLICT') {
    throw new CustomerDocumentConflictError();
  }
  return result.customer;
}

function resolveLocation(
  result: Awaited<ReturnType<CustomerRepository['createLocation']>>,
) {
  if (result.status === 'NOT_FOUND') throw new ServiceLocationNotFoundError();
  if (result.status === 'CUSTOMER_NOT_FOUND') throw new CustomerNotFoundError();
  if (result.status === 'CUSTOMER_ARCHIVED') throw new ArchivedCustomerError();
  return result.location;
}

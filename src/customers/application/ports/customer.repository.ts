import type {
  ArchiveFilter,
  Customer,
  LocationStatus,
  ServiceLocation,
} from '../../domain/customer';

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');

export interface MutationContext {
  organizationId: string;
  actorUserId: string;
  requestId: string;
}

export interface CustomerPage {
  items: Customer[];
  page: number;
  pageSize: number;
  total: number;
}

export interface LocationPage {
  items: ServiceLocation[];
  page: number;
  pageSize: number;
  total: number;
}

export type CustomerWriteResult =
  | { status: 'SUCCESS'; customer: Customer }
  | { status: 'NOT_FOUND' }
  | { status: 'DOCUMENT_CONFLICT' };

export type LocationWriteResult =
  | { status: 'SUCCESS'; location: ServiceLocation }
  | { status: 'NOT_FOUND' }
  | { status: 'CUSTOMER_NOT_FOUND' }
  | { status: 'CUSTOMER_ARCHIVED' };

export interface CustomerRepository {
  listCustomers(input: {
    organizationId: string;
    page: number;
    pageSize: number;
    search?: string;
    archive: ArchiveFilter;
  }): Promise<CustomerPage>;
  findCustomer(
    organizationId: string,
    customerId: string,
  ): Promise<Customer | null>;
  createCustomer(
    input: MutationContext & {
      name: string;
      normalizedName: string;
      document: string | null;
      normalizedDocument: string | null;
      email: string | null;
      phone: string | null;
      notes: string | null;
    },
  ): Promise<CustomerWriteResult>;
  updateCustomer(
    input: MutationContext & {
      customerId: string;
      name?: string;
      normalizedName?: string;
      document?: string | null;
      normalizedDocument?: string | null;
      email?: string | null;
      phone?: string | null;
      notes?: string | null;
    },
  ): Promise<CustomerWriteResult>;
  archiveCustomer(
    input: MutationContext & { customerId: string },
  ): Promise<CustomerWriteResult>;
  listLocations(input: {
    organizationId: string;
    customerId: string;
    page: number;
    pageSize: number;
    search?: string;
    status?: LocationStatus;
  }): Promise<LocationPage | null>;
  findLocation(
    organizationId: string,
    locationId: string,
  ): Promise<ServiceLocation | null>;
  createLocation(
    input: MutationContext & LocationWriteData & { customerId: string },
  ): Promise<LocationWriteResult>;
  updateLocation(
    input: MutationContext &
      Partial<LocationWriteData> & { locationId: string },
  ): Promise<LocationWriteResult>;
}

export interface LocationWriteData {
  name: string;
  normalizedName: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  contactName: string | null;
  contactPhone: string | null;
  accessInstructions: string | null;
  status: LocationStatus;
}

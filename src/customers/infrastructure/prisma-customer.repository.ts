import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type {
  CustomerRepository,
  CustomerWriteResult,
  LocationWriteResult,
} from '../application/ports/customer.repository';

const customerSelect = {
  id: true,
  name: true,
  document: true,
  email: true,
  phone: true,
  notes: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const locationSelect = {
  id: true,
  customerId: true,
  name: true,
  postalCode: true,
  street: true,
  number: true,
  complement: true,
  neighborhood: true,
  city: true,
  state: true,
  country: true,
  contactName: true,
  contactPhone: true,
  accessInstructions: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listCustomers(
    input: Parameters<CustomerRepository['listCustomers']>[0],
  ) {
    const documentSearch = input.search
      ?.replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase();
    const where: Prisma.CustomerWhereInput = {
      organizationId: input.organizationId,
      ...(input.archive === 'ACTIVE'
        ? { archivedAt: null }
        : input.archive === 'ARCHIVED'
          ? { archivedAt: { not: null } }
          : {}),
      ...(input.search
        ? {
            OR: [
              { normalizedName: { startsWith: input.search } },
              ...(documentSearch
                ? [{ normalizedDocument: { startsWith: documentSearch } }]
                : []),
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        select: customerSelect,
        orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  findCustomer(organizationId: string, customerId: string) {
    return this.prisma.customer.findUnique({
      where: { organizationId_id: { organizationId, id: customerId } },
      select: customerSelect,
    });
  }

  async createCustomer(
    input: Parameters<CustomerRepository['createCustomer']>[0],
  ): Promise<CustomerWriteResult> {
    try {
      const customer = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.customer.create({
          data: {
            organizationId: input.organizationId,
            name: input.name,
            normalizedName: input.normalizedName,
            document: input.document,
            normalizedDocument: input.normalizedDocument,
            email: input.email,
            phone: input.phone,
            notes: input.notes,
          },
          select: customerSelect,
        });
        await writeAudit(transaction, input, created.id, 'CUSTOMER_CREATED');
        return created;
      });
      return { status: 'SUCCESS', customer };
    } catch (error) {
      if (isUniqueConflict(error)) return { status: 'DOCUMENT_CONFLICT' };
      throw error;
    }
  }

  async updateCustomer(
    input: Parameters<CustomerRepository['updateCustomer']>[0],
  ): Promise<CustomerWriteResult> {
    try {
      const updated = await this.prisma.customer.updateMany({
        where: {
          organizationId: input.organizationId,
          id: input.customerId,
        },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.normalizedName === undefined
            ? {}
            : { normalizedName: input.normalizedName }),
          ...(input.document === undefined ? {} : { document: input.document }),
          ...(input.normalizedDocument === undefined
            ? {}
            : { normalizedDocument: input.normalizedDocument }),
          ...(input.email === undefined ? {} : { email: input.email }),
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
        },
      });
      if (updated.count !== 1) return { status: 'NOT_FOUND' };
      const customer = await this.findCustomer(
        input.organizationId,
        input.customerId,
      );
      return customer
        ? { status: 'SUCCESS', customer }
        : { status: 'NOT_FOUND' };
    } catch (error) {
      if (isUniqueConflict(error)) return { status: 'DOCUMENT_CONFLICT' };
      throw error;
    }
  }

  archiveCustomer(
    input: Parameters<CustomerRepository['archiveCustomer']>[0],
  ): Promise<CustomerWriteResult> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.customer.findUnique({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.customerId,
          },
        },
        select: customerSelect,
      });
      if (!current) return { status: 'NOT_FOUND' };
      if (current.archivedAt) return { status: 'SUCCESS', customer: current };
      const customer = await transaction.customer.update({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.customerId,
          },
        },
        data: { archivedAt: new Date() },
        select: customerSelect,
      });
      await writeAudit(transaction, input, customer.id, 'CUSTOMER_ARCHIVED');
      return { status: 'SUCCESS', customer };
    });
  }

  async listLocations(
    input: Parameters<CustomerRepository['listLocations']>[0],
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: {
        organizationId_id: {
          organizationId: input.organizationId,
          id: input.customerId,
        },
      },
      select: { id: true },
    });
    if (!customer) return null;
    const where: Prisma.ServiceLocationWhereInput = {
      organizationId: input.organizationId,
      customerId: input.customerId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.search ? { normalizedName: { startsWith: input.search } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.serviceLocation.findMany({
        where,
        select: locationSelect,
        orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.serviceLocation.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  findLocation(organizationId: string, locationId: string) {
    return this.prisma.serviceLocation.findUnique({
      where: { organizationId_id: { organizationId, id: locationId } },
      select: locationSelect,
    });
  }

  createLocation(
    input: Parameters<CustomerRepository['createLocation']>[0],
  ): Promise<LocationWriteResult> {
    return this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.findUnique({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.customerId,
          },
        },
        select: { id: true, archivedAt: true },
      });
      if (!customer) return { status: 'CUSTOMER_NOT_FOUND' };
      if (customer.archivedAt) return { status: 'CUSTOMER_ARCHIVED' };
      const location = await transaction.serviceLocation.create({
        data: locationCreateData(input),
        select: locationSelect,
      });
      return { status: 'SUCCESS', location };
    });
  }

  async updateLocation(
    input: Parameters<CustomerRepository['updateLocation']>[0],
  ): Promise<LocationWriteResult> {
    const updated = await this.prisma.serviceLocation.updateMany({
      where: { organizationId: input.organizationId, id: input.locationId },
      data: locationUpdateData(input),
    });
    if (updated.count !== 1) return { status: 'NOT_FOUND' };
    const location = await this.findLocation(
      input.organizationId,
      input.locationId,
    );
    return location ? { status: 'SUCCESS', location } : { status: 'NOT_FOUND' };
  }
}

function locationCreateData(
  input: Parameters<CustomerRepository['createLocation']>[0],
): Prisma.ServiceLocationUncheckedCreateInput {
  return {
    organizationId: input.organizationId,
    customerId: input.customerId,
    name: input.name,
    normalizedName: input.normalizedName,
    postalCode: input.postalCode,
    street: input.street,
    number: input.number,
    complement: input.complement,
    neighborhood: input.neighborhood,
    city: input.city,
    state: input.state,
    country: input.country,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    accessInstructions: input.accessInstructions,
    status: input.status,
  };
}

function locationUpdateData(
  input: Parameters<CustomerRepository['updateLocation']>[0],
): Prisma.ServiceLocationUpdateManyMutationInput {
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.normalizedName === undefined
      ? {}
      : { normalizedName: input.normalizedName }),
    ...(input.postalCode === undefined ? {} : { postalCode: input.postalCode }),
    ...(input.street === undefined ? {} : { street: input.street }),
    ...(input.number === undefined ? {} : { number: input.number }),
    ...(input.complement === undefined ? {} : { complement: input.complement }),
    ...(input.neighborhood === undefined
      ? {}
      : { neighborhood: input.neighborhood }),
    ...(input.city === undefined ? {} : { city: input.city }),
    ...(input.state === undefined ? {} : { state: input.state }),
    ...(input.country === undefined ? {} : { country: input.country }),
    ...(input.contactName === undefined
      ? {}
      : { contactName: input.contactName }),
    ...(input.contactPhone === undefined
      ? {}
      : { contactPhone: input.contactPhone }),
    ...(input.accessInstructions === undefined
      ? {}
      : { accessInstructions: input.accessInstructions }),
    ...(input.status === undefined ? {} : { status: input.status }),
  };
}

function writeAudit(
  transaction: Prisma.TransactionClient,
  context: { organizationId: string; actorUserId: string; requestId: string },
  resourceId: string,
  action: string,
) {
  return transaction.auditLog.create({
    data: {
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action,
      resourceType: 'CUSTOMER',
      resourceId,
    },
  });
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

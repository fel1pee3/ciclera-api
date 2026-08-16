import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type { ParsedInitialData } from '../domain/initial-data-import';
import type { InitialDataImportRepository } from '../application/ports/initial-data-import.repository';

type ImportClient = Pick<Prisma.TransactionClient, 'customer' | 'equipment'>;

@Injectable()
export class PrismaInitialDataImportRepository implements InitialDataImportRepository {
  constructor(private readonly prisma: PrismaService) {}

  inspect(organizationId: string, data: ParsedInitialData) {
    return conflicts(this.prisma, organizationId, data);
  }

  commit(input: Parameters<InitialDataImportRepository['commit']>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${input.organizationId}))
      `;
      const previous = await transaction.initialDataImport.findUnique({
        where: {
          organizationId_checksum: {
            organizationId: input.organizationId,
            checksum: input.data.checksum,
          },
        },
        select: { id: true, result: true },
      });
      if (previous) {
        return {
          status: 'ALREADY_IMPORTED',
          importId: previous.id,
          checksum: input.data.checksum,
          counts: parseCounts(previous.result),
        } as const;
      }
      const validation = await conflicts(
        transaction,
        input.organizationId,
        input.data,
      );
      if (validation.size) {
        return { status: 'INVALID', errors: validation } as const;
      }
      const customerIds = new Map<string, string>();
      for (const customer of input.data.customers) {
        const created = await transaction.customer.create({
          data: {
            organizationId: input.organizationId,
            name: customer.name,
            normalizedName: customer.normalizedName,
            document: customer.document,
            normalizedDocument: customer.normalizedDocument,
          },
          select: { id: true },
        });
        customerIds.set(customer.externalKey, created.id);
      }
      const locationIds = new Map<string, { id: string; customerId: string }>();
      for (const location of input.data.locations) {
        const customerId = required(customerIds, location.parentExternalKey);
        const created = await transaction.serviceLocation.create({
          data: {
            organizationId: input.organizationId,
            customerId,
            name: location.name,
            normalizedName: location.normalizedName,
            postalCode: location.postalCode,
            street: location.street,
            number: location.number,
            complement: location.complement,
            neighborhood: location.neighborhood,
            city: location.city,
            state: location.state,
          },
          select: { id: true },
        });
        locationIds.set(location.externalKey, { id: created.id, customerId });
      }
      for (const equipment of input.data.equipment) {
        const location = required(locationIds, equipment.parentExternalKey);
        await transaction.equipment.create({
          data: {
            organizationId: input.organizationId,
            customerId: location.customerId,
            locationId: location.id,
            name: equipment.name,
            normalizedName: equipment.normalizedName,
            identifier: equipment.identifier,
            normalizedIdentifier: equipment.normalizedIdentifier,
            category: equipment.category,
            brand: equipment.brand,
            model: equipment.model,
            serialNumber: equipment.serialNumber,
            normalizedSerialNumber: equipment.normalizedSerialNumber,
          },
        });
      }
      const counts = {
        customers: input.data.customers.length,
        locations: input.data.locations.length,
        equipment: input.data.equipment.length,
      };
      const imported = await transaction.initialDataImport.create({
        data: {
          organizationId: input.organizationId,
          createdByUserId: input.actorUserId,
          checksum: input.data.checksum,
          result: counts,
        },
        select: { id: true },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          requestId: input.requestId,
          action: 'INITIAL_DATA_IMPORTED',
          resourceType: 'INITIAL_DATA_IMPORT',
          resourceId: imported.id,
          metadata: counts,
        },
      });
      return {
        status: 'IMPORTED',
        importId: imported.id,
        checksum: input.data.checksum,
        counts,
      } as const;
    });
  }
}

async function conflicts(
  client: ImportClient,
  organizationId: string,
  data: ParsedInitialData,
): Promise<Map<number, string[]>> {
  const [customers, equipment] = await Promise.all([
    client.customer.findMany({
      where: {
        organizationId,
        OR: [
          {
            normalizedName: {
              in: data.customers.map((item) => item.normalizedName),
            },
          },
          {
            normalizedDocument: {
              in: data.customers.flatMap((item) =>
                item.normalizedDocument ? [item.normalizedDocument] : [],
              ),
            },
          },
        ],
      },
      select: { normalizedName: true, normalizedDocument: true },
    }),
    client.equipment.findMany({
      where: {
        organizationId,
        OR: [
          {
            normalizedIdentifier: {
              in: data.equipment.map((item) => item.normalizedIdentifier),
            },
          },
          {
            normalizedSerialNumber: {
              in: data.equipment.flatMap((item) =>
                item.normalizedSerialNumber
                  ? [item.normalizedSerialNumber]
                  : [],
              ),
            },
          },
        ],
      },
      select: { normalizedIdentifier: true, normalizedSerialNumber: true },
    }),
  ]);
  const errors = new Map<number, string[]>();
  for (const item of data.customers) {
    if (
      customers.some(
        (existing) =>
          existing.normalizedName === item.normalizedName ||
          (item.normalizedDocument &&
            existing.normalizedDocument === item.normalizedDocument),
      )
    ) {
      errors.set(item.line, ['Cliente já cadastrado na organização.']);
    }
  }
  for (const item of data.equipment) {
    if (
      equipment.some(
        (existing) =>
          existing.normalizedIdentifier === item.normalizedIdentifier ||
          (item.normalizedSerialNumber &&
            existing.normalizedSerialNumber === item.normalizedSerialNumber),
      )
    ) {
      errors.set(item.line, ['Equipamento já cadastrado na organização.']);
    }
  }
  return errors;
}

function required<T>(values: Map<string, T>, key: string): T {
  const value = values.get(key);
  if (!value) throw new Error('IMPORT_RELATION_INVALID');
  return value;
}

function parseCounts(value: Prisma.JsonValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('IMPORT_RESULT_INVALID');
  }
  const customerCount = value.customers;
  const locationCount = value.locations;
  const equipmentCount = value.equipment;
  if (
    typeof customerCount !== 'number' ||
    typeof locationCount !== 'number' ||
    typeof equipmentCount !== 'number'
  ) {
    throw new Error('IMPORT_RESULT_INVALID');
  }
  return {
    customers: customerCount,
    locations: locationCount,
    equipment: equipmentCount,
  };
}

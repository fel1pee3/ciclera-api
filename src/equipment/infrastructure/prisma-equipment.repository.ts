import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type {
  EquipmentMutationContext,
  EquipmentRepository,
  EquipmentWriteResult,
} from '../application/ports/equipment.repository';

const equipmentSelect = {
  id: true,
  customerId: true,
  locationId: true,
  name: true,
  identifier: true,
  category: true,
  brand: true,
  model: true,
  serialNumber: true,
  notes: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaEquipmentRepository implements EquipmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: Parameters<EquipmentRepository['list']>[0]) {
    const where: Prisma.EquipmentWhereInput = {
      organizationId: input.organizationId,
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.locationId ? { locationId: input.locationId } : {}),
      ...(input.archive === 'ACTIVE'
        ? { archivedAt: null }
        : input.archive === 'ARCHIVED'
          ? { archivedAt: { not: null } }
          : {}),
      ...(input.search
        ? {
            OR: [
              { normalizedName: { startsWith: input.search } },
              { normalizedIdentifier: { startsWith: input.search } },
              { normalizedSerialNumber: { startsWith: input.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.equipment.findMany({
        where,
        select: equipmentSelect,
        orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.equipment.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  find(organizationId: string, equipmentId: string) {
    return this.prisma.equipment.findUnique({
      where: { organizationId_id: { organizationId, id: equipmentId } },
      select: equipmentSelect,
    });
  }

  async create(
    input: Parameters<EquipmentRepository['create']>[0],
  ): Promise<EquipmentWriteResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        if (!(await validRelation(transaction, input))) {
          return { status: 'RELATION_INVALID' };
        }
        const equipment = await transaction.equipment.create({
          data: createData(input),
          select: equipmentSelect,
        });
        await writeAudit(transaction, input, equipment.id, 'EQUIPMENT_CREATED');
        return { status: 'SUCCESS', equipment };
      });
    } catch (error) {
      if (isUniqueConflict(error)) return { status: 'SERIAL_CONFLICT' };
      throw error;
    }
  }

  async update(
    input: Parameters<EquipmentRepository['update']>[0],
  ): Promise<EquipmentWriteResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.equipment.findUnique({
          where: {
            organizationId_id: {
              organizationId: input.organizationId,
              id: input.equipmentId,
            },
          },
          select: { customerId: true, locationId: true },
        });
        if (!current) return { status: 'NOT_FOUND' };
        const relation = {
          customerId: input.customerId ?? current.customerId,
          locationId: input.locationId ?? current.locationId,
        };
        if (!(await validRelation(transaction, { ...input, ...relation }))) {
          return { status: 'RELATION_INVALID' };
        }
        const equipment = await transaction.equipment.update({
          where: {
            organizationId_id: {
              organizationId: input.organizationId,
              id: input.equipmentId,
            },
          },
          data: updateData(input),
          select: equipmentSelect,
        });
        await writeAudit(transaction, input, equipment.id, 'EQUIPMENT_UPDATED');
        return { status: 'SUCCESS', equipment };
      });
    } catch (error) {
      if (isUniqueConflict(error)) return { status: 'SERIAL_CONFLICT' };
      throw error;
    }
  }

  archive(
    input: Parameters<EquipmentRepository['archive']>[0],
  ): Promise<EquipmentWriteResult> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.equipment.findUnique({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.equipmentId,
          },
        },
        select: equipmentSelect,
      });
      if (!current) return { status: 'NOT_FOUND' };
      if (current.archivedAt) return { status: 'SUCCESS', equipment: current };
      const equipment = await transaction.equipment.update({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.equipmentId,
          },
        },
        data: { archivedAt: new Date() },
        select: equipmentSelect,
      });
      await writeAudit(transaction, input, equipment.id, 'EQUIPMENT_ARCHIVED');
      return { status: 'SUCCESS', equipment };
    });
  }

  reactivate(
    input: Parameters<EquipmentRepository['reactivate']>[0],
  ): Promise<EquipmentWriteResult> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.equipment.findUnique({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.equipmentId,
          },
        },
        select: equipmentSelect,
      });
      if (!current) return { status: 'NOT_FOUND' };
      if (!current.archivedAt) return { status: 'SUCCESS', equipment: current };
      if (
        !(await validRelation(transaction, {
          organizationId: input.organizationId,
          customerId: current.customerId,
          locationId: current.locationId,
        }))
      ) {
        return { status: 'RELATION_INVALID' };
      }
      const equipment = await transaction.equipment.update({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.equipmentId,
          },
        },
        data: { archivedAt: null },
        select: equipmentSelect,
      });
      await writeAudit(
        transaction,
        input,
        equipment.id,
        'EQUIPMENT_REACTIVATED',
      );
      return { status: 'SUCCESS', equipment };
    });
  }
}

function createData(
  input: Parameters<EquipmentRepository['create']>[0],
): Prisma.EquipmentUncheckedCreateInput {
  return {
    organizationId: input.organizationId,
    customerId: input.customerId,
    locationId: input.locationId,
    name: input.name,
    normalizedName: input.normalizedName,
    identifier: input.identifier,
    normalizedIdentifier: input.normalizedIdentifier,
    category: input.category,
    brand: input.brand,
    model: input.model,
    serialNumber: input.serialNumber,
    normalizedSerialNumber: input.normalizedSerialNumber,
    notes: input.notes,
  };
}

function updateData(
  input: Parameters<EquipmentRepository['update']>[0],
): Prisma.EquipmentUncheckedUpdateInput {
  return {
    ...(input.customerId === undefined ? {} : { customerId: input.customerId }),
    ...(input.locationId === undefined ? {} : { locationId: input.locationId }),
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.normalizedName === undefined
      ? {}
      : { normalizedName: input.normalizedName }),
    ...(input.identifier === undefined ? {} : { identifier: input.identifier }),
    ...(input.normalizedIdentifier === undefined
      ? {}
      : { normalizedIdentifier: input.normalizedIdentifier }),
    ...(input.category === undefined ? {} : { category: input.category }),
    ...(input.brand === undefined ? {} : { brand: input.brand }),
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.serialNumber === undefined
      ? {}
      : { serialNumber: input.serialNumber }),
    ...(input.normalizedSerialNumber === undefined
      ? {}
      : { normalizedSerialNumber: input.normalizedSerialNumber }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  };
}

async function validRelation(
  transaction: Prisma.TransactionClient,
  input: { organizationId: string; customerId: string; locationId: string },
) {
  const location = await transaction.serviceLocation.findUnique({
    where: {
      organizationId_customerId_id: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        id: input.locationId,
      },
    },
    select: { status: true, customer: { select: { archivedAt: true } } },
  });
  return Boolean(
    location && location.status === 'ACTIVE' && !location.customer.archivedAt,
  );
}

function writeAudit(
  transaction: Prisma.TransactionClient,
  context: EquipmentMutationContext,
  resourceId: string,
  action: string,
) {
  return transaction.auditLog.create({
    data: {
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action,
      resourceType: 'EQUIPMENT',
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

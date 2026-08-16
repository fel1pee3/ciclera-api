import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import {
  displayText,
  normalizedText,
  optionalText,
} from '../../customers/domain/normalization';
import type { EquipmentArchiveFilter } from '../domain/equipment';
import {
  EquipmentManagementForbiddenError,
  EquipmentNotFoundError,
  EquipmentRelationInvalidError,
  EquipmentSerialConflictError,
} from '../domain/equipment.errors';
import {
  EQUIPMENT_REPOSITORY,
  type EquipmentRepository,
  type EquipmentWriteData,
} from './ports/equipment.repository';

export interface EquipmentInput {
  customerId: string;
  locationId: string;
  name: string;
  identifier: string;
  category: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  notes?: string | null;
}

interface RequestContext {
  principal: AuthenticatedPrincipal;
  requestId: string;
}

@Injectable()
export class EquipmentService {
  constructor(
    @Inject(EQUIPMENT_REPOSITORY)
    private readonly equipment: EquipmentRepository,
  ) {}

  list(
    context: RequestContext,
    query: {
      page: number;
      pageSize: number;
      search?: string;
      archive: EquipmentArchiveFilter;
      customerId?: string;
      locationId?: string;
    },
  ) {
    this.requireManager(context.principal);
    return this.equipment.list({
      ...query,
      organizationId: context.principal.organizationId,
      ...(query.search ? { search: normalizedText(query.search) } : {}),
    });
  }

  async find(context: RequestContext, equipmentId: string) {
    this.requireManager(context.principal);
    const equipment = await this.equipment.find(
      context.principal.organizationId,
      equipmentId,
    );
    if (!equipment) throw new EquipmentNotFoundError();
    return equipment;
  }

  create(context: RequestContext, input: EquipmentInput) {
    this.requireManager(context.principal);
    return this.resolve(
      this.equipment.create({
        ...mutationContext(context),
        ...equipmentData(input),
      }),
    );
  }

  update(
    context: RequestContext,
    equipmentId: string,
    input: Partial<EquipmentInput>,
  ) {
    this.requireManager(context.principal);
    return this.resolve(
      this.equipment.update({
        ...mutationContext(context),
        equipmentId,
        ...equipmentPatch(input),
      }),
    );
  }

  archive(context: RequestContext, equipmentId: string) {
    this.requireManager(context.principal);
    return this.resolve(
      this.equipment.archive({
        ...mutationContext(context),
        equipmentId,
      }),
    );
  }

  private async resolve(
    resultPromise: ReturnType<EquipmentRepository['create']>,
  ) {
    const result = await resultPromise;
    if (result.status === 'NOT_FOUND') throw new EquipmentNotFoundError();
    if (result.status === 'RELATION_INVALID') {
      throw new EquipmentRelationInvalidError();
    }
    if (result.status === 'SERIAL_CONFLICT') {
      throw new EquipmentSerialConflictError();
    }
    return result.equipment;
  }

  private requireManager(principal: AuthenticatedPrincipal): void {
    if (principal.role === 'TECHNICIAN') {
      throw new EquipmentManagementForbiddenError();
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

function equipmentData(input: EquipmentInput): EquipmentWriteData {
  const serialNumber = optionalText(input.serialNumber);
  return {
    customerId: input.customerId,
    locationId: input.locationId,
    name: displayText(input.name),
    normalizedName: normalizedText(input.name),
    identifier: displayText(input.identifier),
    normalizedIdentifier: normalizedText(input.identifier),
    category: displayText(input.category),
    brand: optionalText(input.brand),
    model: optionalText(input.model),
    serialNumber,
    normalizedSerialNumber: serialNumber ? normalizedText(serialNumber) : null,
    notes: optionalText(input.notes),
  };
}

function equipmentPatch(input: Partial<EquipmentInput>) {
  const serialNumber =
    input.serialNumber === undefined
      ? undefined
      : optionalText(input.serialNumber);
  return {
    ...(input.customerId === undefined ? {} : { customerId: input.customerId }),
    ...(input.locationId === undefined ? {} : { locationId: input.locationId }),
    ...(input.name === undefined
      ? {}
      : {
          name: displayText(input.name),
          normalizedName: normalizedText(input.name),
        }),
    ...(input.identifier === undefined
      ? {}
      : {
          identifier: displayText(input.identifier),
          normalizedIdentifier: normalizedText(input.identifier),
        }),
    ...(input.category === undefined
      ? {}
      : { category: displayText(input.category) }),
    ...(input.brand === undefined ? {} : { brand: optionalText(input.brand) }),
    ...(input.model === undefined ? {} : { model: optionalText(input.model) }),
    ...(serialNumber === undefined
      ? {}
      : {
          serialNumber,
          normalizedSerialNumber: serialNumber
            ? normalizedText(serialNumber)
            : null,
        }),
    ...(input.notes === undefined ? {} : { notes: optionalText(input.notes) }),
  };
}

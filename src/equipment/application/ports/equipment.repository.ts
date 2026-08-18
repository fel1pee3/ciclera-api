import type { Equipment, EquipmentArchiveFilter } from '../../domain/equipment';

export const EQUIPMENT_REPOSITORY = Symbol('EQUIPMENT_REPOSITORY');

export interface EquipmentMutationContext {
  organizationId: string;
  actorUserId: string;
  requestId: string;
}

export interface EquipmentWriteData {
  customerId: string;
  locationId: string;
  name: string;
  normalizedName: string;
  identifier: string;
  normalizedIdentifier: string;
  category: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  normalizedSerialNumber: string | null;
  notes: string | null;
}

export type EquipmentWriteResult =
  | { status: 'SUCCESS'; equipment: Equipment }
  | { status: 'NOT_FOUND' }
  | { status: 'RELATION_INVALID' }
  | { status: 'SERIAL_CONFLICT' };

export interface EquipmentRepository {
  list(input: {
    organizationId: string;
    page: number;
    pageSize: number;
    search?: string;
    archive: EquipmentArchiveFilter;
    customerId?: string;
    locationId?: string;
  }): Promise<{
    items: Equipment[];
    page: number;
    pageSize: number;
    total: number;
  }>;
  find(organizationId: string, equipmentId: string): Promise<Equipment | null>;
  create(
    input: EquipmentMutationContext & EquipmentWriteData,
  ): Promise<EquipmentWriteResult>;
  update(
    input: EquipmentMutationContext &
      Partial<EquipmentWriteData> & { equipmentId: string },
  ): Promise<EquipmentWriteResult>;
  archive(
    input: EquipmentMutationContext & { equipmentId: string },
  ): Promise<EquipmentWriteResult>;
  reactivate(
    input: EquipmentMutationContext & { equipmentId: string },
  ): Promise<EquipmentWriteResult>;
}

export type EquipmentArchiveFilter = 'ACTIVE' | 'ARCHIVED' | 'ALL';

export interface Equipment {
  id: string;
  customerId: string;
  locationId: string;
  name: string;
  identifier: string;
  category: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

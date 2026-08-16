export type ArchiveFilter = 'ACTIVE' | 'ARCHIVED' | 'ALL';
export type LocationStatus = 'ACTIVE' | 'INACTIVE';

export interface Customer {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceLocation {
  id: string;
  customerId: string;
  name: string;
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
  createdAt: Date;
  updatedAt: Date;
}

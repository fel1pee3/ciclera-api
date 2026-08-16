import type { UserRole } from '../../auth/domain/authenticated-principal';

export const userStatuses = ['ACTIVE', 'INACTIVE'] as const;
export type UserStatus = (typeof userStatuses)[number];

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

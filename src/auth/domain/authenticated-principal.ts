export const userRoles = ['OWNER', 'ADMIN', 'TECHNICIAN'] as const;

export type UserRole = (typeof userRoles)[number];

export interface AuthenticatedPrincipal {
  userId: string;
  organizationId: string;
  role: UserRole;
  sessionId: string;
}

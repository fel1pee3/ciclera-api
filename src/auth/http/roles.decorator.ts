import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../domain/authenticated-principal';

export const requiredRolesMetadataKey = 'auth:required-roles';

export const Roles = (
  ...roles: readonly UserRole[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(requiredRolesMetadataKey, roles);

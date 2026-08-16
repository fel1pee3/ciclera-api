import { ApiProperty } from '@nestjs/swagger';
import type { AuthenticatedAccount } from '../application/ports/identity.repository';
import { userRoles } from '../domain/authenticated-principal';
import type { UserRole } from '../domain/authenticated-principal';

class AuthenticatedUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ enum: userRoles })
  role!: UserRole;
}

class AuthenticatedOrganizationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: 'America/Sao_Paulo' })
  timezone!: string;
}

export class AuthenticatedAccountResponseDto implements AuthenticatedAccount {
  @ApiProperty({ type: AuthenticatedUserResponseDto })
  user!: AuthenticatedUserResponseDto;

  @ApiProperty({ type: AuthenticatedOrganizationResponseDto })
  organization!: AuthenticatedOrganizationResponseDto;
}

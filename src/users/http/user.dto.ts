import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  userRoles,
  type UserRole,
} from '../../auth/domain/authenticated-principal';
import { normalizeEmailInput } from '../../auth/http/auth-input.transforms';
import { userStatuses, type UserStatus } from '../domain/managed-user';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
}

export class ListUsersQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: 'A página deve ser um número inteiro.' })
  @Min(1, { message: 'A página deve ser maior que zero.' })
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt({ message: 'O tamanho da página deve ser um número inteiro.' })
  @Min(1, { message: 'O tamanho da página deve ser maior que zero.' })
  @Max(100, { message: 'O tamanho da página deve ser no máximo 100.' })
  pageSize = 20;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  search?: string;

  @ApiPropertyOptional({ enum: userRoles })
  @IsOptional()
  @IsIn(userRoles)
  role?: UserRole;

  @ApiPropertyOptional({ enum: userStatuses })
  @IsOptional()
  @IsIn(userStatuses)
  status?: UserStatus;
}

export class CreateUserDto {
  @ApiProperty({ minLength: 2, maxLength: 160 })
  @Transform(trimString)
  @IsString()
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  @MaxLength(160, { message: 'O nome deve ter no máximo 160 caracteres.' })
  name!: string;

  @ApiProperty({ format: 'email', maxLength: 320 })
  @Transform(normalizeEmailInput)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(320)
  email!: string;

  @ApiProperty({ format: 'password', minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(10, { message: 'A senha deve ter pelo menos 10 caracteres.' })
  @MaxLength(128, { message: 'A senha deve ter no máximo 128 caracteres.' })
  @Matches(/[A-Z]/, { message: 'A senha deve conter uma letra maiúscula.' })
  @Matches(/[a-z]/, { message: 'A senha deve conter uma letra minúscula.' })
  @Matches(/\d/, { message: 'A senha deve conter um número.' })
  @Matches(/[^A-Za-z0-9\s]/, { message: 'A senha deve conter um símbolo.' })
  password!: string;

  @ApiProperty({ enum: userRoles })
  @IsIn(userRoles)
  role!: UserRole;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 160 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  @MaxLength(160, { message: 'O nome deve ter no máximo 160 caracteres.' })
  name?: string;

  @ApiPropertyOptional({ format: 'email', maxLength: 320 })
  @IsOptional()
  @Transform(normalizeEmailInput)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ format: 'password', minLength: 10, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'A senha deve ter pelo menos 10 caracteres.' })
  @MaxLength(128, { message: 'A senha deve ter no máximo 128 caracteres.' })
  @Matches(/[A-Z]/, { message: 'A senha deve conter uma letra maiúscula.' })
  @Matches(/[a-z]/, { message: 'A senha deve conter uma letra minúscula.' })
  @Matches(/\d/, { message: 'A senha deve conter um número.' })
  @Matches(/[^A-Za-z0-9\s]/, { message: 'A senha deve conter um símbolo.' })
  password?: string;

  @ApiPropertyOptional({ enum: userRoles })
  @IsOptional()
  @IsIn(userRoles)
  role?: UserRole;
}

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ enum: userRoles })
  role!: UserRole;

  @ApiProperty({ enum: userStatuses })
  status!: UserStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class PaginatedUsersResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  items!: UserResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  total!: number;
}

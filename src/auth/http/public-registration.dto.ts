import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsString,
  IsTimeZone,
  MaxLength,
  MinLength,
} from 'class-validator';
import { currentLegalVersion } from '../application/public-registration.service';
import { normalizeEmailInput } from './auth-input.transforms';

function trimName({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
}

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class PublicRegistrationRequestDto {
  @ApiProperty({ minLength: 2, maxLength: 160 })
  @Transform(trimName)
  @IsString({ message: 'Informe o nome da organiza\u00e7\u00e3o.' })
  @MinLength(2, {
    message:
      'O nome da organiza\u00e7\u00e3o deve ter pelo menos 2 caracteres.',
  })
  @MaxLength(160, {
    message:
      'O nome da organiza\u00e7\u00e3o deve ter no m\u00e1ximo 160 caracteres.',
  })
  organizationName!: string;

  @ApiProperty({ minLength: 2, maxLength: 160 })
  @Transform(trimName)
  @IsString({ message: 'Informe seu nome.' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  @MaxLength(160, { message: 'O nome deve ter no m\u00e1ximo 160 caracteres.' })
  ownerName!: string;

  @ApiProperty({ format: 'email', maxLength: 320 })
  @Transform(normalizeEmailInput)
  @IsEmail({}, { message: 'Informe um e-mail v\u00e1lido.' })
  @MaxLength(320, {
    message: 'O e-mail deve ter no m\u00e1ximo 320 caracteres.',
  })
  email!: string;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 128 })
  @IsString({ message: 'Informe a senha.' })
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres.' })
  @MaxLength(128, {
    message: 'A senha deve ter no m\u00e1ximo 128 caracteres.',
  })
  password!: string;

  @ApiProperty({ example: 'America/Sao_Paulo', maxLength: 64 })
  @Transform(trimString)
  @IsString({ message: 'Informe o fuso hor\u00e1rio.' })
  @MaxLength(64, {
    message: 'O fuso hor\u00e1rio deve ter no m\u00e1ximo 64 caracteres.',
  })
  @IsTimeZone({ message: 'Informe um fuso hor\u00e1rio IANA v\u00e1lido.' })
  timezone!: string;

  @ApiProperty({ example: true })
  @IsBoolean({ message: 'Confirme o aceite dos termos e da privacidade.' })
  @Equals(true, {
    message: 'Aceite os termos e a pol\u00edtica de privacidade.',
  })
  termsAccepted!: true;

  @ApiProperty({ example: currentLegalVersion })
  @IsString()
  @Equals(currentLegalVersion, {
    message:
      'Atualize a p\u00e1gina e aceite a vers\u00e3o vigente dos termos.',
  })
  termsVersion!: string;
}

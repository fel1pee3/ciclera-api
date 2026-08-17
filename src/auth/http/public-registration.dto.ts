import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { currentLegalVersion } from '../application/public-registration.service';
import { normalizeEmailInput } from './auth-input.transforms';

function trimName({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
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

  @ApiProperty({
    format: 'password',
    minLength: 10,
    maxLength: 128,
    description: 'Deve conter letras maiúscula e minúscula, número e símbolo.',
  })
  @IsString({ message: 'Informe a senha.' })
  @MinLength(10, { message: 'A senha deve ter pelo menos 10 caracteres.' })
  @MaxLength(128, {
    message: 'A senha deve ter no m\u00e1ximo 128 caracteres.',
  })
  @Matches(/[A-Z]/, { message: 'A senha deve conter uma letra maiúscula.' })
  @Matches(/[a-z]/, { message: 'A senha deve conter uma letra minúscula.' })
  @Matches(/\d/, { message: 'A senha deve conter um número.' })
  @Matches(/[^A-Za-z0-9\s]/, { message: 'A senha deve conter um símbolo.' })
  password!: string;

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

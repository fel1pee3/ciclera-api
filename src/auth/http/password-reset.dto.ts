import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeEmailInput } from './auth-input.transforms';

export class ForgotPasswordRequestDto {
  @ApiProperty({ example: 'owner.a@demo.ciclera.local', maxLength: 320 })
  @Transform(normalizeEmailInput)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(320, { message: 'O e-mail deve ter no máximo 320 caracteres.' })
  email!: string;
}

export class ResetPasswordRequestDto {
  @ApiProperty({ minLength: 43, maxLength: 43 })
  @IsString({ message: 'Informe o token de redefinição.' })
  @Matches(/^[A-Za-z0-9_-]{43}$/, {
    message: 'Informe um token de redefinição válido.',
  })
  token!: string;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 128 })
  @IsString({ message: 'Informe a nova senha.' })
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres.' })
  @MaxLength(128, { message: 'A senha deve ter no máximo 128 caracteres.' })
  password!: string;
}

export class ForgotPasswordAcceptedResponseDto {
  @ApiProperty({
    example:
      'Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação.',
  })
  message!: string;
}

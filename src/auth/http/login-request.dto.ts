import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeEmailInput } from './auth-input.transforms';

export class LoginRequestDto {
  @ApiProperty({ example: 'owner.a@demo.ciclera.local', maxLength: 320 })
  @Transform(normalizeEmailInput)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(320, { message: 'O e-mail deve ter no máximo 320 caracteres.' })
  email!: string;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 128 })
  @IsString({ message: 'Informe a senha.' })
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres.' })
  @MaxLength(128, { message: 'A senha deve ter no máximo 128 caracteres.' })
  password!: string;
}

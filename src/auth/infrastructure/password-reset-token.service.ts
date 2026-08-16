import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type {
  CreatedPasswordResetToken,
  PasswordResetTokenService,
} from '../application/ports/password-reset-token.port';

const passwordResetTokenPattern = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class CryptoPasswordResetTokenService implements PasswordResetTokenService {
  create(): CreatedPasswordResetToken {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: hashToken(token) };
  }

  hash(token: string): string | null {
    return passwordResetTokenPattern.test(token) ? hashToken(token) : null;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

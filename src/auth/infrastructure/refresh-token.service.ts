import { Injectable } from '@nestjs/common';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  CreatedRefreshToken,
  ParsedRefreshToken,
  RefreshTokenService,
} from '../application/ports/token-services.port';

const refreshTokenPattern =
  /^(?<sessionId>[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(?<secret>[A-Za-z0-9_-]{43})$/i;

@Injectable()
export class CryptoRefreshTokenService implements RefreshTokenService {
  create(): CreatedRefreshToken {
    const sessionId = randomUUID();
    const token = `${sessionId}.${randomBytes(32).toString('base64url')}`;

    return { sessionId, token, tokenHash: hashToken(token) };
  }

  parse(token: string): ParsedRefreshToken | null {
    const match = refreshTokenPattern.exec(token);
    const sessionId = match?.groups?.sessionId;

    if (!sessionId) {
      return null;
    }

    return { sessionId: sessionId.toLowerCase(), tokenHash: hashToken(token) };
  }

  hashesMatch(storedHash: string, presentedHash: string): boolean {
    const stored = hashBuffer(storedHash);
    const presented = hashBuffer(presentedHash);

    if (!stored || !presented) {
      const dummy = Buffer.alloc(32);
      timingSafeEqual(stored ?? dummy, presented ?? dummy);
      return false;
    }

    return timingSafeEqual(stored, presented);
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function hashBuffer(value: string): Buffer | null {
  return /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : null;
}

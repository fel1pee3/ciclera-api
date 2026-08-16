import { createHash } from 'node:crypto';
import { normalizeEmail } from '../application/auth.service';
import { readCookie, refreshCookieName } from './auth-cookies';

export function authIdentifierTracker(
  request: Record<string, unknown>,
): string {
  const body = isRecord(request.body) ? request.body : {};
  const email = body.email;

  if (typeof email === 'string') {
    return `email:${digest(normalizeEmail(email))}`;
  }

  const resetToken = body.token;

  if (typeof resetToken === 'string') {
    return `reset:${digest(resetToken)}`;
  }

  const headers = isRecord(request.headers) ? request.headers : {};
  const cookieHeader = headers.cookie;
  const refreshToken =
    typeof cookieHeader === 'string'
      ? readCookie(cookieHeader, refreshCookieName)
      : undefined;
  const sessionId = refreshToken?.split('.', 1)[0];

  if (sessionId) {
    return `session:${digest(sessionId)}`;
  }

  const ip = typeof request.ip === 'string' ? request.ip : 'unknown';
  return `anonymous:${digest(ip)}`;
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

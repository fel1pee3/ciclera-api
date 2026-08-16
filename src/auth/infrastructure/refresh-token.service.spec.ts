import { CryptoRefreshTokenService } from './refresh-token.service';

describe('CryptoRefreshTokenService', () => {
  const service = new CryptoRefreshTokenService();

  it('creates an opaque high-entropy token and exposes only its hash for persistence', () => {
    const created = service.create();

    expect(created.token).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/i);
    expect(created.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(created.tokenHash).not.toContain(created.token);
    expect(service.parse(created.token)).toEqual({
      sessionId: created.sessionId,
      tokenHash: created.tokenHash,
    });
  });

  it('rejects malformed tokens and compares hashes in constant time', () => {
    const first = service.create();
    const second = service.create();

    expect(service.parse('not-a-refresh-token')).toBeNull();
    expect(service.hashesMatch(first.tokenHash, first.tokenHash)).toBe(true);
    expect(service.hashesMatch(first.tokenHash, second.tokenHash)).toBe(false);
    expect(service.hashesMatch('invalid', second.tokenHash)).toBe(false);
  });
});

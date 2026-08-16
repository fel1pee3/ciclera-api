import { CryptoPasswordResetTokenService } from './password-reset-token.service';

describe('CryptoPasswordResetTokenService', () => {
  const service = new CryptoPasswordResetTokenService();

  it('creates an opaque high-entropy token and only exposes its hash for persistence', () => {
    const created = service.create();

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(created.tokenHash).not.toContain(created.token);
    expect(service.hash(created.token)).toBe(created.tokenHash);
  });

  it('rejects malformed reset tokens before persistence lookup', () => {
    expect(service.hash('invalid')).toBeNull();
    expect(service.hash('a'.repeat(42))).toBeNull();
    expect(service.hash(`${'a'.repeat(42)}!`)).toBeNull();
  });
});

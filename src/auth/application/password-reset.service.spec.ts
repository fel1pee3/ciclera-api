import { PasswordResetService } from './password-reset.service';
import type { EmailGateway } from './ports/email-gateway.port';
import type { PasswordHasher } from './ports/password-hasher.port';
import type { PasswordResetDeliveryObserver } from './ports/password-reset-delivery-observer.port';
import type { PasswordResetRepository } from './ports/password-reset.repository';
import type { PasswordResetTokenService } from './ports/password-reset-token.port';
import {
  InvalidPasswordResetTokenError,
  PasswordResetDeliveryUnavailableError,
} from '../domain/password-reset.errors';

describe('PasswordResetService', () => {
  let resets: jest.Mocked<PasswordResetRepository>;
  let resetTokens: jest.Mocked<PasswordResetTokenService>;
  let passwords: jest.Mocked<PasswordHasher>;
  let deliveryObserver: jest.Mocked<PasswordResetDeliveryObserver>;
  let emailGateway: jest.Mocked<EmailGateway>;
  let service: PasswordResetService;

  beforeEach(() => {
    resets = {
      create: jest.fn(),
      consume: jest.fn(),
      invalidate: jest.fn(),
    };
    resetTokens = {
      create: jest.fn().mockReturnValue({
        token: 'a'.repeat(43),
        tokenHash: 'b'.repeat(64),
      }),
      hash: jest.fn().mockReturnValue('b'.repeat(64)),
    };
    passwords = {
      hash: jest.fn().mockResolvedValue('$argon2id$test-password-hash'),
      verify: jest.fn(),
      performDummyVerification: jest.fn(),
    };
    deliveryObserver = {
      recordFailure: jest.fn(),
    };
    emailGateway = {
      isAvailable: jest.fn().mockReturnValue(true),
      sendPasswordReset: jest.fn(),
    };
    service = new PasswordResetService(
      resets,
      resetTokens,
      passwords,
      deliveryObserver,
      emailGateway,
      {
        refreshTokenTtlSeconds: 2_592_000,
        passwordResetTokenTtlSeconds: 1_800,
        webUrl: 'http://localhost:3000',
      },
    );
  });

  it('creates one hashed token and sends a development-safe reset URL', async () => {
    resets.create.mockResolvedValue({ email: 'User@Example.test' });

    await expect(
      service.request('  USER@example.test  '),
    ).resolves.toBeUndefined();
    await service.onApplicationShutdown();

    expect(resets.create.mock.calls[0]?.[0]).toMatchObject({
      normalizedEmail: 'user@example.test',
      tokenHash: 'b'.repeat(64),
    });
    expect(passwords.performDummyVerification.mock.calls).toHaveLength(1);
    expect(emailGateway.sendPasswordReset.mock.calls).toEqual([
      [
        {
          recipientEmail: 'User@Example.test',
          resetUrl: `http://localhost:3000/redefinir-senha#token=${'a'.repeat(43)}`,
        },
      ],
    ]);
  });

  it('returns normally for an unknown identity without invoking delivery', async () => {
    resets.create.mockResolvedValue(null);

    await expect(
      service.request('unknown@example.test'),
    ).resolves.toBeUndefined();
    await service.onApplicationShutdown();
    expect(passwords.performDummyVerification.mock.calls).toHaveLength(1);
    expect(emailGateway.sendPasswordReset.mock.calls).toHaveLength(0);
  });

  it('accepts the public request without waiting for provider delivery', async () => {
    resets.create.mockResolvedValue({ email: 'user@example.test' });
    let finishDelivery: (() => void) | undefined;
    emailGateway.sendPasswordReset.mockReturnValue(
      new Promise<void>((resolve) => {
        finishDelivery = resolve;
      }),
    );

    await expect(service.request('user@example.test')).resolves.toBeUndefined();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(emailGateway.sendPasswordReset.mock.calls).toHaveLength(1);

    finishDelivery?.();
    await service.onApplicationShutdown();
  });

  it('fails before identity lookup when delivery is unavailable', async () => {
    emailGateway.isAvailable.mockReturnValue(false);

    await expect(service.request('user@example.test')).rejects.toBeInstanceOf(
      PasswordResetDeliveryUnavailableError,
    );
    expect(resets.create.mock.calls).toHaveLength(0);
  });

  it('invalidates the new token and preserves the public flow when delivery fails', async () => {
    resets.create.mockResolvedValue({ email: 'user@example.test' });
    emailGateway.sendPasswordReset.mockRejectedValue(
      new Error('test delivery failure'),
    );

    await expect(service.request('user@example.test')).resolves.toBeUndefined();
    await service.onApplicationShutdown();
    expect(resets.invalidate.mock.calls[0]?.[0]).toMatchObject({
      tokenHash: 'b'.repeat(64),
    });
    expect(deliveryObserver.recordFailure.mock.calls).toEqual([['delivery']]);
  });

  it('does not expose an invalidation failure after a delivery error', async () => {
    resets.create.mockResolvedValue({ email: 'user@example.test' });
    emailGateway.sendPasswordReset.mockRejectedValue(
      new Error('test delivery failure'),
    );
    resets.invalidate.mockRejectedValue(new Error('test database failure'));

    await expect(service.request('user@example.test')).resolves.toBeUndefined();
    await service.onApplicationShutdown();
    expect(deliveryObserver.recordFailure.mock.calls).toEqual([
      ['delivery'],
      ['token-invalidation'],
    ]);
  });

  it('hashes the new password and consumes a valid token exactly once', async () => {
    resets.consume.mockResolvedValue(true);

    await expect(
      service.reset('a'.repeat(43), 'new-local-password'),
    ).resolves.toBeUndefined();
    expect(passwords.hash.mock.calls).toEqual([['new-local-password']]);
    expect(resets.consume.mock.calls[0]?.[0]).toMatchObject({
      tokenHash: 'b'.repeat(64),
      passwordHash: '$argon2id$test-password-hash',
    });
  });

  it('uses the same rejection for malformed or unusable tokens', async () => {
    resetTokens.hash.mockReturnValueOnce(null);

    await expect(
      service.reset('invalid', 'new-local-password'),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

    resetTokens.hash.mockReturnValueOnce('b'.repeat(64));
    resets.consume.mockResolvedValueOnce(false);
    await expect(
      service.reset('a'.repeat(43), 'new-local-password'),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
  });
});

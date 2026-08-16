import { hash } from 'argon2';
import { Argon2PasswordHasher } from './argon2-password-hasher';

describe('Argon2PasswordHasher', () => {
  const service = new Argon2PasswordHasher();

  it('verifies Argon2id hashes without exposing or reproducing the password', async () => {
    const passwordHash = await hash('local-test-password');

    await expect(
      service.verify(passwordHash, 'local-test-password'),
    ).resolves.toBe(true);
    await expect(service.verify(passwordHash, 'incorrect')).resolves.toBe(
      false,
    );
  });

  it('performs a real dummy verification for unknown identities', async () => {
    await expect(
      service.performDummyVerification('unknown-password'),
    ).resolves.toBeUndefined();
  });
});

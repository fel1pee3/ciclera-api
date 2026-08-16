export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface PasswordHasher {
  verify(passwordHash: string, password: string): Promise<boolean>;
  performDummyVerification(password: string): Promise<void>;
}

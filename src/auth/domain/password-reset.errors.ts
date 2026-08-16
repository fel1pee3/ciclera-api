export class InvalidPasswordResetTokenError extends Error {
  constructor() {
    super('Invalid password reset token.');
    this.name = 'InvalidPasswordResetTokenError';
  }
}

export class PasswordResetDeliveryUnavailableError extends Error {
  constructor() {
    super('Password reset delivery is unavailable.');
    this.name = 'PasswordResetDeliveryUnavailableError';
  }
}

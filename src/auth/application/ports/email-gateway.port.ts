export const EMAIL_GATEWAY = Symbol('EMAIL_GATEWAY');

export interface PasswordResetEmail {
  recipientEmail: string;
  resetUrl: string;
}

export interface EmailGateway {
  isAvailable(): boolean;
  sendPasswordReset(input: PasswordResetEmail): Promise<void>;
}

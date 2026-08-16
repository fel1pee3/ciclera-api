import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readEnvironment } from '../../config/environment';
import type {
  EmailGateway,
  PasswordResetEmail,
} from '../application/ports/email-gateway.port';

@Injectable()
export class LocalPasswordResetEmailGateway implements EmailGateway {
  private readonly isDevelopment: boolean;

  constructor(configService: ConfigService) {
    this.isDevelopment =
      readEnvironment(configService).NODE_ENV === 'development';
  }

  isAvailable(): boolean {
    return true;
  }

  sendPasswordReset(input: PasswordResetEmail): Promise<void> {
    if (this.isDevelopment) {
      const entry = {
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: 'auth.password-reset.local-delivery',
        metadata: {
          recipientDigest: createHash('sha256')
            .update(input.recipientEmail, 'utf8')
            .digest('hex'),
          developmentOnlyLink: input.resetUrl,
        },
      };
      process.stdout.write(`${JSON.stringify(entry)}\n`);
    }

    return Promise.resolve();
  }
}

@Injectable()
export class DisabledPasswordResetEmailGateway implements EmailGateway {
  isAvailable(): boolean {
    return false;
  }

  sendPasswordReset(): Promise<void> {
    return Promise.reject(new Error('Password reset delivery is disabled.'));
  }
}

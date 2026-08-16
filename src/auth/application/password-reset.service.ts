import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { normalizeEmail } from './auth.service';
import { AUTH_CONFIGURATION } from './ports/auth-configuration.port';
import type { AuthConfiguration } from './ports/auth-configuration.port';
import { EMAIL_GATEWAY } from './ports/email-gateway.port';
import type { EmailGateway } from './ports/email-gateway.port';
import { PASSWORD_HASHER } from './ports/password-hasher.port';
import type { PasswordHasher } from './ports/password-hasher.port';
import { PASSWORD_RESET_DELIVERY_OBSERVER } from './ports/password-reset-delivery-observer.port';
import type {
  PasswordResetDeliveryFailureStage,
  PasswordResetDeliveryObserver,
} from './ports/password-reset-delivery-observer.port';
import { PASSWORD_RESET_REPOSITORY } from './ports/password-reset.repository';
import type { PasswordResetRepository } from './ports/password-reset.repository';
import { PASSWORD_RESET_TOKEN_SERVICE } from './ports/password-reset-token.port';
import type { PasswordResetTokenService } from './ports/password-reset-token.port';
import {
  InvalidPasswordResetTokenError,
  PasswordResetDeliveryUnavailableError,
} from '../domain/password-reset.errors';

@Injectable()
export class PasswordResetService implements OnApplicationShutdown {
  private readonly tokenTtlMilliseconds: number;
  private readonly pendingRequests = new Set<Promise<void>>();

  constructor(
    @Inject(PASSWORD_RESET_REPOSITORY)
    private readonly resets: PasswordResetRepository,
    @Inject(PASSWORD_RESET_TOKEN_SERVICE)
    private readonly resetTokens: PasswordResetTokenService,
    @Inject(PASSWORD_HASHER)
    private readonly passwords: PasswordHasher,
    @Inject(PASSWORD_RESET_DELIVERY_OBSERVER)
    private readonly deliveryObserver: PasswordResetDeliveryObserver,
    @Inject(EMAIL_GATEWAY)
    private readonly emailGateway: EmailGateway,
    @Inject(AUTH_CONFIGURATION)
    private readonly configuration: AuthConfiguration,
  ) {
    this.tokenTtlMilliseconds =
      configuration.passwordResetTokenTtlSeconds * 1_000;
  }

  request(email: string): Promise<void> {
    if (!this.emailGateway.isAvailable()) {
      return Promise.reject(new PasswordResetDeliveryUnavailableError());
    }

    const pendingRequest = this.processRequest(normalizeEmail(email));
    this.pendingRequests.add(pendingRequest);
    void pendingRequest.finally(() => {
      this.pendingRequests.delete(pendingRequest);
    });
    return Promise.resolve();
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.pendingRequests);
  }

  private async processRequest(normalizedEmail: string): Promise<void> {
    try {
      const now = new Date();
      const createdToken = this.resetTokens.create();
      const recipient = await this.resets.create({
        normalizedEmail,
        tokenHash: createdToken.tokenHash,
        expiresAt: new Date(now.getTime() + this.tokenTtlMilliseconds),
        now,
      });
      await this.passwords.performDummyVerification(normalizedEmail);

      if (!recipient) {
        return;
      }

      try {
        await this.emailGateway.sendPasswordReset({
          recipientEmail: recipient.email,
          resetUrl: buildResetUrl(
            this.configuration.webUrl,
            createdToken.token,
          ),
        });
      } catch {
        this.recordDeliveryFailure('delivery');

        try {
          await this.resets.invalidate({
            tokenHash: createdToken.tokenHash,
            now: new Date(),
          });
        } catch {
          this.recordDeliveryFailure('token-invalidation');
        }
      }
    } catch {
      this.recordDeliveryFailure('processing');
    }
  }

  async reset(token: string, password: string): Promise<void> {
    const tokenHash = this.resetTokens.hash(token);
    const passwordHash = await this.passwords.hash(password);

    if (
      !tokenHash ||
      !(await this.resets.consume({
        tokenHash,
        passwordHash,
        now: new Date(),
      }))
    ) {
      throw new InvalidPasswordResetTokenError();
    }
  }

  private recordDeliveryFailure(
    stage: PasswordResetDeliveryFailureStage,
  ): void {
    try {
      this.deliveryObserver.recordFailure(stage);
    } catch {
      // Observability cannot change the public recovery contract.
    }
  }
}

function buildResetUrl(webUrl: string, token: string): string {
  const url = new URL('/redefinir-senha', webUrl);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

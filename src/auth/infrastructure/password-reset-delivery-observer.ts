import { Injectable } from '@nestjs/common';
import type {
  PasswordResetDeliveryFailureStage,
  PasswordResetDeliveryObserver,
} from '../application/ports/password-reset-delivery-observer.port';
import { StructuredLoggerService } from '../../observability/structured-logger.service';

@Injectable()
export class StructuredPasswordResetDeliveryObserver implements PasswordResetDeliveryObserver {
  private readonly logger = new StructuredLoggerService();

  recordFailure(stage: PasswordResetDeliveryFailureStage): void {
    this.logger.error('auth.password-reset.delivery-failed', { stage });
  }
}

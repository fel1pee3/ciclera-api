import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserRole } from '../../auth/domain/authenticated-principal';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from './ports/subscription.repository';

@Injectable()
export class SubscriptionEntitlementsService {
  readonly enforcementEnabled: boolean;

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    config: ConfigService,
  ) {
    this.enforcementEnabled = config.getOrThrow<boolean>(
      'SUBSCRIPTION_ENFORCEMENT_ENABLED',
    );
  }

  async assertUserSeat(organizationId: string, role: UserRole) {
    if (!this.enforcementEnabled) return;
    await this.subscriptions.assertUserSeat({ organizationId, role });
  }

  async assertEvidenceStorage(organizationId: string, incomingBytes: number) {
    if (!this.enforcementEnabled) return;
    await this.subscriptions.assertEvidenceStorage({
      organizationId,
      incomingBytes,
    });
  }
}

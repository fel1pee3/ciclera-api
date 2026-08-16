import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

type EvidenceCapability = 'upload' | 'read';

@Injectable()
export class EvidenceTokenService {
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.ttlSeconds = config.getOrThrow<number>('EVIDENCE_URL_TTL');
  }

  issue(capability: EvidenceCapability, evidenceId: string, objectKey: string) {
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    const payload = this.payload(
      capability,
      evidenceId,
      objectKey,
      Math.floor(expiresAt.getTime() / 1000),
    );
    const signature = this.sign(payload);
    return {
      token: `${Buffer.from(payload).toString('base64url')}.${signature}`,
      expiresAt,
    };
  }

  verify(
    token: string,
    capability: EvidenceCapability,
    evidenceId: string,
    objectKey: string,
  ): boolean {
    const [encoded, received] = token.split('.');
    if (!encoded || !received) return false;
    let payload: string;
    try {
      payload = Buffer.from(encoded, 'base64url').toString('utf8');
    } catch {
      return false;
    }
    const parts = payload.split(':');
    const expiresAt = Number(parts.at(-1));
    if (
      payload !== this.payload(capability, evidenceId, objectKey, expiresAt) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt < Math.floor(Date.now() / 1000)
    ) {
      return false;
    }
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(received);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private payload(
    capability: EvidenceCapability,
    evidenceId: string,
    objectKey: string,
    expiresAt: number,
  ) {
    return `ciclera-evidence:${capability}:${evidenceId}:${objectKey}:${expiresAt}`;
  }

  private sign(payload: string) {
    return createHmac('sha256', this.secret)
      .update(payload)
      .digest('base64url');
  }
}

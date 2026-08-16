import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateSessionInput,
  FindActiveSessionInput,
  RevokeAllSessionsInput,
  RevokeCurrentSessionInput,
  RotateSessionInput,
  RotateSessionResult,
  SessionRepository,
} from '../application/ports/session.repository';
import { ResolvedSession } from '../application/ports/session-resolver.port';
import { REFRESH_TOKEN_SERVICE } from '../application/ports/token-services.port';
import type { RefreshTokenService } from '../application/ports/token-services.port';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';

const rotationReason = 'ROTATED';
const reuseReason = 'REFRESH_TOKEN_REUSE_DETECTED';
const logoutReason = 'LOGOUT';
const logoutAllReason = 'LOGOUT_ALL';

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REFRESH_TOKEN_SERVICE)
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  create(input: CreateSessionInput): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const identity = await transaction.user.findFirst({
        where: {
          id: input.userId,
          organizationId: input.organizationId,
          status: 'ACTIVE',
          organization: { status: 'ACTIVE' },
        },
        select: { id: true },
      });

      if (!identity) {
        return false;
      }

      await transaction.session.create({
        data: {
          id: input.sessionId,
          organizationId: input.organizationId,
          userId: input.userId,
          familyId: input.familyId,
          refreshTokenHash: input.refreshTokenHash,
          expiresAt: input.expiresAt,
        },
      });
      await transaction.user.update({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.userId,
          },
        },
        data: { lastLoginAt: input.now },
      });

      return true;
    });
  }

  rotate(input: RotateSessionInput): Promise<RotateSessionResult> {
    return this.prisma.$transaction(
      async (transaction) => {
        const current = await transaction.session.findUnique({
          where: { id: input.currentSessionId },
          select: {
            id: true,
            organizationId: true,
            userId: true,
            familyId: true,
            refreshTokenHash: true,
            expiresAt: true,
            revokedAt: true,
            revocationReason: true,
            user: {
              select: {
                status: true,
                organization: { select: { status: true } },
              },
            },
          },
        });

        if (
          !current ||
          !this.refreshTokens.hashesMatch(
            current.refreshTokenHash,
            input.currentRefreshTokenHash,
          )
        ) {
          return { status: 'INVALID' };
        }

        if (current.revokedAt) {
          if (current.revocationReason === rotationReason) {
            await revokeFamily(transaction, current, input.now, reuseReason);
            return { status: 'REUSED' };
          }

          return { status: 'INVALID' };
        }

        if (
          current.expiresAt <= input.now ||
          current.user.status !== 'ACTIVE' ||
          current.user.organization.status !== 'ACTIVE'
        ) {
          return { status: 'INVALID' };
        }

        const rotated = await transaction.session.updateMany({
          where: {
            id: current.id,
            organizationId: current.organizationId,
            userId: current.userId,
            revokedAt: null,
            expiresAt: { gt: input.now },
          },
          data: {
            revokedAt: input.now,
            revocationReason: rotationReason,
            lastUsedAt: input.now,
          },
        });

        if (rotated.count !== 1) {
          await revokeFamily(transaction, current, input.now, reuseReason);
          return { status: 'REUSED' };
        }

        const next = await transaction.session.create({
          data: {
            id: input.nextSessionId,
            organizationId: current.organizationId,
            userId: current.userId,
            familyId: current.familyId,
            refreshTokenHash: input.nextRefreshTokenHash,
            expiresAt: input.nextExpiresAt,
          },
          select: { id: true, organizationId: true, userId: true },
        });

        return {
          status: 'ROTATED',
          session: {
            sessionId: next.id,
            organizationId: next.organizationId,
            userId: next.userId,
          },
        };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  }

  async revokeCurrent(input: RevokeCurrentSessionInput): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.session.findUnique({
        where: { id: input.sessionId },
        select: {
          id: true,
          organizationId: true,
          userId: true,
          refreshTokenHash: true,
        },
      });

      if (
        !current ||
        !this.refreshTokens.hashesMatch(
          current.refreshTokenHash,
          input.refreshTokenHash,
        )
      ) {
        return;
      }

      await transaction.session.updateMany({
        where: {
          id: current.id,
          organizationId: current.organizationId,
          userId: current.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: input.now,
          revocationReason: logoutReason,
          lastUsedAt: input.now,
        },
      });
    });
  }

  async revokeAll(input: RevokeAllSessionsInput): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        organizationId: input.organizationId,
        userId: input.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: input.now,
        revocationReason: logoutAllReason,
        lastUsedAt: input.now,
      },
    });
  }

  async findActive(
    input: FindActiveSessionInput,
  ): Promise<ResolvedSession | null> {
    const session = await this.prisma.session.findFirst({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
        userId: input.userId,
        revokedAt: null,
        expiresAt: { gt: input.now },
      },
      select: { id: true, organizationId: true, userId: true },
    });

    return session
      ? {
          sessionId: session.id,
          organizationId: session.organizationId,
          userId: session.userId,
        }
      : null;
  }
}

interface SessionFamilyIdentity {
  familyId: string;
  organizationId: string;
  userId: string;
}

async function revokeFamily(
  transaction: Prisma.TransactionClient,
  session: SessionFamilyIdentity,
  now: Date,
  reason: string,
): Promise<void> {
  await transaction.session.updateMany({
    where: {
      familyId: session.familyId,
      organizationId: session.organizationId,
      userId: session.userId,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
      revocationReason: reason,
      lastUsedAt: now,
    },
  });
}

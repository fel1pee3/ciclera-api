import { Injectable } from '@nestjs/common';
import {
  ConsumePasswordResetInput,
  CreatePasswordResetInput,
  InvalidatePasswordResetInput,
  PasswordResetRecipient,
  PasswordResetRepository,
} from '../application/ports/password-reset.repository';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';

const passwordResetReason = 'PASSWORD_RESET';

@Injectable()
export class PrismaPasswordResetRepository implements PasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    input: CreatePasswordResetInput,
  ): Promise<PasswordResetRecipient | null> {
    return this.prisma.$transaction(
      async (transaction) => {
        const identity = await transaction.user.findUnique({
          where: { normalizedEmail: input.normalizedEmail },
          select: {
            id: true,
            organizationId: true,
            email: true,
            status: true,
            organization: { select: { status: true } },
          },
        });

        if (
          !identity ||
          identity.status !== 'ACTIVE' ||
          identity.organization.status !== 'ACTIVE'
        ) {
          return null;
        }

        await transaction.passwordResetToken.updateMany({
          where: {
            organizationId: identity.organizationId,
            userId: identity.id,
            usedAt: null,
          },
          data: { usedAt: input.now },
        });
        await transaction.passwordResetToken.create({
          data: {
            organizationId: identity.organizationId,
            userId: identity.id,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
          },
        });

        return { email: identity.email };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  }

  consume(input: ConsumePasswordResetInput): Promise<boolean> {
    return this.prisma.$transaction(
      async (transaction) => {
        const resetToken = await transaction.passwordResetToken.findUnique({
          where: { tokenHash: input.tokenHash },
          select: {
            id: true,
            organizationId: true,
            userId: true,
            expiresAt: true,
            usedAt: true,
            user: {
              select: {
                status: true,
                organization: { select: { status: true } },
              },
            },
          },
        });

        if (
          !resetToken ||
          resetToken.usedAt ||
          resetToken.expiresAt <= input.now ||
          resetToken.user.status !== 'ACTIVE' ||
          resetToken.user.organization.status !== 'ACTIVE'
        ) {
          return false;
        }

        const consumed = await transaction.passwordResetToken.updateMany({
          where: {
            id: resetToken.id,
            organizationId: resetToken.organizationId,
            userId: resetToken.userId,
            usedAt: null,
            expiresAt: { gt: input.now },
          },
          data: { usedAt: input.now },
        });

        if (consumed.count !== 1) {
          return false;
        }

        await transaction.user.update({
          where: {
            organizationId_id: {
              organizationId: resetToken.organizationId,
              id: resetToken.userId,
            },
          },
          data: { passwordHash: input.passwordHash },
        });
        await transaction.passwordResetToken.updateMany({
          where: {
            organizationId: resetToken.organizationId,
            userId: resetToken.userId,
            usedAt: null,
          },
          data: { usedAt: input.now },
        });
        await transaction.session.updateMany({
          where: {
            organizationId: resetToken.organizationId,
            userId: resetToken.userId,
            revokedAt: null,
          },
          data: {
            revokedAt: input.now,
            revocationReason: passwordResetReason,
            lastUsedAt: input.now,
          },
        });

        return true;
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  }

  async invalidate(input: InvalidatePasswordResetInput): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: { tokenHash: input.tokenHash, usedAt: null },
      data: { usedAt: input.now },
    });
  }
}

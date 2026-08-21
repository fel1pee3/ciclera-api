import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreatePublicRegistrationInput,
  CreatePublicRegistrationResult,
  PublicRegistrationRepository,
} from '../application/ports/public-registration.repository';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';

@Injectable()
export class PrismaPublicRegistrationRepository implements PublicRegistrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreatePublicRegistrationInput,
  ): Promise<CreatePublicRegistrationResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const account = await this.prisma.$transaction(
          async (transaction) => {
            const organization = await transaction.organization.create({
              data: {
                id: input.organizationId,
                name: input.organizationName,
                timezone: input.timezone,
                status: 'ACTIVE',
              },
              select: { id: true, name: true, timezone: true },
            });
            const user = await transaction.user.create({
              data: {
                id: input.ownerId,
                organizationId: organization.id,
                name: input.ownerName,
                email: input.email,
                normalizedEmail: input.normalizedEmail,
                passwordHash: input.passwordHash,
                role: 'OWNER',
                status: 'ACTIVE',
                lastLoginAt: input.acceptedAt,
              },
              select: { id: true, name: true, email: true, role: true },
            });

            await transaction.workOrderCounter.create({
              data: { organizationId: organization.id, lastNumber: 0 },
            });
            await transaction.organizationSubscription.create({
              data: { organizationId: organization.id, status: 'PENDING' },
            });
            await transaction.legalAcceptance.create({
              data: {
                organizationId: organization.id,
                userId: user.id,
                termsVersion: input.termsVersion,
                privacyVersion: input.privacyVersion,
                acceptedAt: input.acceptedAt,
              },
            });
            await transaction.session.create({
              data: {
                id: input.sessionId,
                organizationId: organization.id,
                userId: user.id,
                familyId: input.familyId,
                refreshTokenHash: input.refreshTokenHash,
                expiresAt: input.sessionExpiresAt,
              },
            });
            await transaction.auditLog.create({
              data: {
                organizationId: organization.id,
                actorUserId: user.id,
                requestId: input.requestId,
                action: 'ORGANIZATION_REGISTERED',
                resourceType: 'ORGANIZATION',
                resourceId: organization.id,
                metadata: {
                  termsVersion: input.termsVersion,
                  privacyVersion: input.privacyVersion,
                },
              },
            });

            return { user, organization };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10_000,
            timeout: 15_000,
          },
        );

        return { status: 'CREATED', account };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return { status: 'EMAIL_CONFLICT' };
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 2
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new Error('Public registration transaction retry exhausted.');
  }
}

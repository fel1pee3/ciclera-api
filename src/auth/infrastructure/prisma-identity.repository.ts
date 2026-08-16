import { Injectable } from '@nestjs/common';
import {
  AuthenticatedAccount,
  FindAccountInput,
  IdentityRepository,
  LoginIdentity,
} from '../application/ports/identity.repository';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';

@Injectable()
export class PrismaIdentityRepository implements IdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<LoginIdentity | null> {
    const identity = await this.prisma.user.findUnique({
      where: { normalizedEmail },
      select: {
        id: true,
        name: true,
        email: true,
        normalizedEmail: true,
        passwordHash: true,
        role: true,
        status: true,
        organization: {
          select: {
            id: true,
            name: true,
            timezone: true,
            status: true,
          },
        },
      },
    });

    if (!identity) {
      return null;
    }

    return {
      user: {
        id: identity.id,
        name: identity.name,
        email: identity.email,
        role: identity.role,
      },
      organization: {
        id: identity.organization.id,
        name: identity.organization.name,
        timezone: identity.organization.timezone,
      },
      normalizedEmail: identity.normalizedEmail,
      passwordHash: identity.passwordHash,
      userStatus: identity.status,
      organizationStatus: identity.organization.status,
    };
  }

  async findAccount(
    input: FindAccountInput,
  ): Promise<AuthenticatedAccount | null> {
    const identity = await this.prisma.user.findUnique({
      where: {
        organizationId_id: {
          organizationId: input.organizationId,
          id: input.userId,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        organization: {
          select: {
            id: true,
            name: true,
            timezone: true,
            status: true,
          },
        },
      },
    });

    if (
      !identity ||
      identity.status !== 'ACTIVE' ||
      identity.organization.status !== 'ACTIVE'
    ) {
      return null;
    }

    return {
      user: {
        id: identity.id,
        name: identity.name,
        email: identity.email,
        role: identity.role,
      },
      organization: {
        id: identity.organization.id,
        name: identity.organization.name,
        timezone: identity.organization.timezone,
      },
    };
  }
}

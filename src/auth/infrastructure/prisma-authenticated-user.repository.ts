import { Injectable } from '@nestjs/common';
import {
  AuthenticatedUser,
  AuthenticatedUserRepository,
  FindAuthenticatedUserInput,
} from '../application/ports/authenticated-user.repository';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';

@Injectable()
export class PrismaAuthenticatedUserRepository implements AuthenticatedUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    input: FindAuthenticatedUserInput,
  ): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: {
        organizationId_id: {
          organizationId: input.organizationId,
          id: input.userId,
        },
      },
      select: {
        id: true,
        organizationId: true,
        role: true,
        status: true,
        organization: {
          select: { status: true },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      organizationId: user.organizationId,
      role: user.role,
      status: user.status,
      organizationStatus: user.organization.status,
    };
  }
}

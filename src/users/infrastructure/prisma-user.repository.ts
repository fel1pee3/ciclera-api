import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';
import type {
  CreateUserResult,
  DeleteUserResult,
  ListUsersInput,
  PaginatedUsers,
  UpdateUserResult,
  UserRepository,
} from '../application/ports/user.repository';
import type { ManagedUser } from '../domain/managed-user';

const managedUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: ListUsersInput): Promise<PaginatedUsers> {
    const where: Prisma.UserWhereInput = {
      organizationId: input.organizationId,
      deletedAt: null,
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: 'insensitive' } },
              { email: { contains: input.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: managedUserSelect,
        orderBy: [{ role: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  findById(
    organizationId: string,
    userId: string,
  ): Promise<ManagedUser | null> {
    return this.prisma.user.findFirst({
      where: { organizationId, id: userId, deletedAt: null },
      select: managedUserSelect,
    });
  }

  async create(
    input: Parameters<UserRepository['create']>[0],
  ): Promise<CreateUserResult> {
    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: {
            organizationId: input.organizationId,
            name: input.name,
            email: input.email,
            normalizedEmail: input.normalizedEmail,
            passwordHash: input.passwordHash,
            role: input.role,
          },
          select: managedUserSelect,
        });
        await writeAudit(transaction, input, created.id, 'USER_CREATED', {
          role: created.role,
          status: created.status,
        });
        return created;
      });
      return { status: 'CREATED', user };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { status: 'EMAIL_CONFLICT' };
      }
      throw error;
    }
  }

  async update(
    input: Parameters<UserRepository['update']>[0],
  ): Promise<UpdateUserResult> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const current = await transaction.user.findUnique({
            where: {
              organizationId_id: {
                organizationId: input.organizationId,
                id: input.userId,
              },
            },
            select: managedUserSelect,
          });
          if (!current) return { status: 'NOT_FOUND' };

          if (
            current.role === 'OWNER' &&
            input.role &&
            input.role !== 'OWNER' &&
            current.status === 'ACTIVE' &&
            (await activeOwnerCount(transaction, input.organizationId)) <= 1
          ) {
            return { status: 'LAST_OWNER' };
          }

          const user = await transaction.user.update({
            where: {
              organizationId_id: {
                organizationId: input.organizationId,
                id: input.userId,
              },
            },
            data: {
              ...(input.name === undefined ? {} : { name: input.name }),
              ...(input.email === undefined
                ? {}
                : {
                    email: input.email,
                    normalizedEmail: input.normalizedEmail,
                  }),
              ...(input.passwordHash === undefined
                ? {}
                : { passwordHash: input.passwordHash }),
              ...(input.role === undefined ? {} : { role: input.role }),
            },
            select: managedUserSelect,
          });
          if (current.role !== user.role) {
            await writeAudit(transaction, input, user.id, 'USER_ROLE_CHANGED', {
              from: current.role,
              to: user.role,
            });
          }
          if (input.email !== undefined && current.email !== user.email) {
            await writeAudit(
              transaction,
              input,
              user.id,
              'USER_EMAIL_CHANGED',
              {
                changed: true,
              },
            );
          }
          if (input.passwordHash !== undefined) {
            await transaction.session.updateMany({
              where: {
                organizationId: input.organizationId,
                userId: input.userId,
                revokedAt: null,
              },
              data: {
                revokedAt: new Date(),
                revocationReason: 'PASSWORD_CHANGED',
              },
            });
            await writeAudit(
              transaction,
              input,
              user.id,
              'USER_PASSWORD_CHANGED',
              { sessionsRevoked: true },
            );
          }
          return { status: 'UPDATED', user };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { status: 'EMAIL_CONFLICT' };
      }
      throw error;
    }
  }

  setStatus(
    input: Parameters<UserRepository['setStatus']>[0],
  ): Promise<UpdateUserResult> {
    return this.prisma.$transaction(
      async (transaction) => {
        const current = await transaction.user.findUnique({
          where: {
            organizationId_id: {
              organizationId: input.organizationId,
              id: input.userId,
            },
          },
          select: managedUserSelect,
        });
        if (!current) return { status: 'NOT_FOUND' };
        if (current.status === input.status) {
          return { status: 'UPDATED', user: current };
        }
        if (
          current.role === 'OWNER' &&
          current.status === 'ACTIVE' &&
          input.status === 'INACTIVE' &&
          (await activeOwnerCount(transaction, input.organizationId)) <= 1
        ) {
          return { status: 'LAST_OWNER' };
        }

        const user = await transaction.user.update({
          where: {
            organizationId_id: {
              organizationId: input.organizationId,
              id: input.userId,
            },
          },
          data: { status: input.status },
          select: managedUserSelect,
        });
        if (input.status === 'INACTIVE') {
          await transaction.session.updateMany({
            where: {
              organizationId: input.organizationId,
              userId: input.userId,
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
              revocationReason: 'USER_DEACTIVATED',
            },
          });
        }
        await writeAudit(
          transaction,
          input,
          user.id,
          input.status === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          { from: current.status, to: user.status },
        );
        return { status: 'UPDATED', user };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  deleteUser(
    input: Parameters<UserRepository['deleteUser']>[0],
  ): Promise<DeleteUserResult> {
    return this.prisma.$transaction(
      async (transaction) => {
        const current = await transaction.user.findFirst({
          where: {
            organizationId: input.organizationId,
            id: input.userId,
            deletedAt: null,
          },
          select: managedUserSelect,
        });
        if (!current) return { status: 'NOT_FOUND' };

        const deletedEmail = `deleted.${current.id}@users.invalid`;
        const user = await transaction.user.update({
          where: {
            organizationId_id: {
              organizationId: input.organizationId,
              id: input.userId,
            },
          },
          data: {
            name: 'Usuário excluído',
            email: deletedEmail,
            normalizedEmail: deletedEmail,
            status: 'INACTIVE',
            deletedAt: new Date(),
          },
          select: managedUserSelect,
        });
        await transaction.session.updateMany({
          where: {
            organizationId: input.organizationId,
            userId: input.userId,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
            revocationReason: 'USER_DELETED',
          },
        });
        await transaction.passwordResetToken.deleteMany({
          where: {
            organizationId: input.organizationId,
            userId: input.userId,
          },
        });
        await writeAudit(transaction, input, current.id, 'USER_DELETED', {
          role: current.role,
          previousStatus: current.status,
        });
        return { status: 'DELETED', user };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

function activeOwnerCount(
  transaction: Prisma.TransactionClient,
  organizationId: string,
): Promise<number> {
  return transaction.user.count({
    where: { organizationId, role: 'OWNER', status: 'ACTIVE' },
  });
}

function writeAudit(
  transaction: Prisma.TransactionClient,
  context: { organizationId: string; actorUserId: string; requestId: string },
  resourceId: string,
  action: string,
  metadata: Prisma.InputJsonObject,
) {
  return transaction.auditLog.create({
    data: {
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action,
      resourceType: 'USER',
      resourceId,
      metadata,
    },
  });
}

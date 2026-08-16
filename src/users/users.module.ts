import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { USER_REPOSITORY } from './application/ports/user.repository';
import { UsersService } from './application/users.service';
import { UsersController } from './http/users.controller';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
  ],
  exports: [UsersService, USER_REPOSITORY],
})
export class UsersModule {}

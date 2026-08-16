import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../infrastructure/database/prisma/prisma.module';
import { CUSTOMER_REPOSITORY } from './application/ports/customer.repository';
import { CustomersService } from './application/customers.service';
import { CustomersController } from './http/customers.controller';
import { PrismaCustomerRepository } from './infrastructure/prisma-customer.repository';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CustomersController],
  providers: [
    CustomersService,
    { provide: CUSTOMER_REPOSITORY, useClass: PrismaCustomerRepository },
  ],
  exports: [CustomersService, CUSTOMER_REPOSITORY],
})
export class CustomersModule {}

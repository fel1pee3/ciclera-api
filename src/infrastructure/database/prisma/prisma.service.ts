import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import {
  getRuntimeDatabaseUrl,
  readEnvironment,
} from '../../../config/environment';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnApplicationShutdown
{
  constructor(configService: ConfigService) {
    const environment = readEnvironment(configService);

    super({
      datasources: {
        db: {
          url: getRuntimeDatabaseUrl(environment),
        },
      },
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}

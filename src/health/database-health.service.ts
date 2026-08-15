import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { getRuntimeDatabaseUrl, readEnvironment } from '../config/environment';

@Injectable()
export class DatabaseHealthService implements OnApplicationShutdown {
  private readonly pool: Pool;

  constructor(configService: ConfigService) {
    const environment = readEnvironment(configService);

    this.pool = new Pool({
      connectionString: getRuntimeDatabaseUrl(environment),
      connectionTimeoutMillis: 2_000,
      idleTimeoutMillis: 30_000,
      max: 2,
    });
  }

  async isReady(): Promise<boolean> {
    try {
      const result = await this.pool.query<{ ready: number }>(
        'SELECT 1 AS ready',
      );
      return result.rows[0]?.ready === 1;
    } catch {
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

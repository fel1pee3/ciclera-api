import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DatabaseHealthService } from './database-health.service';

interface LiveHealthResponse {
  status: 'ok';
}

interface ReadyHealthResponse extends LiveHealthResponse {
  checks: {
    database: 'up';
  };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly databaseHealthService: DatabaseHealthService) {}

  @Get('live')
  @ApiOkResponse({
    description: 'O processo está ativo e respondendo.',
    schema: { example: { status: 'ok' } },
  })
  live(): LiveHealthResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOkResponse({
    description: 'A API e o PostgreSQL estão prontos.',
    schema: {
      example: { status: 'ok', checks: { database: 'up' } },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'Uma dependência essencial não está disponível.',
  })
  async ready(): Promise<ReadyHealthResponse> {
    if (!(await this.databaseHealthService.isReady())) {
      throw new ServiceUnavailableException({
        type: 'https://ciclera.com.br/problems/database-unavailable',
        title: 'Serviço indisponível',
        detail: 'O banco de dados está temporariamente indisponível.',
        code: 'DATABASE_UNAVAILABLE',
      });
    }

    return { status: 'ok', checks: { database: 'up' } };
  }
}

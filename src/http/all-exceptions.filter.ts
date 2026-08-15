import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import { getRequestId, RequestWithId } from './request-id';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  fieldErrors?: Record<string, string[]>;
  requestId: string;
}

interface ProblemDefaults {
  slug: string;
  title: string;
  detail: string;
  code: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const status = getHttpStatus(exception);
    const problem = this.createProblem(exception, status, request);

    if (status >= 500 && status !== 503) {
      this.logger.error('http.request.failed', {
        requestId: problem.requestId,
        method: request.method,
        path: request.path,
        statusCode: status,
        error: exception,
      });
    }

    response.status(status).json(problem);
  }

  private createProblem(
    exception: unknown,
    status: number,
    request: Request,
  ): ProblemDetails {
    const defaults = getProblemDefaults(status);
    const overrides = getSafeOverrides(exception);

    return {
      type:
        overrides.type ?? `https://ciclera.com.br/problems/${defaults.slug}`,
      title: overrides.title ?? defaults.title,
      status,
      detail: overrides.detail ?? defaults.detail,
      code: overrides.code ?? defaults.code,
      ...(overrides.fieldErrors ? { fieldErrors: overrides.fieldErrors } : {}),
      requestId: getRequestId(request as RequestWithId),
    };
  }
}

function getSafeOverrides(exception: unknown): Partial<ProblemDetails> {
  if (!(exception instanceof HttpException)) {
    return {};
  }

  const response = exception.getResponse();

  if (typeof response !== 'object' || response === null) {
    return {};
  }

  const body = response as Record<string, unknown>;
  const overrides: Partial<ProblemDetails> = {};

  if (typeof body.type === 'string') overrides.type = body.type;
  if (typeof body.title === 'string') overrides.title = body.title;
  if (typeof body.detail === 'string') overrides.detail = body.detail;
  if (typeof body.code === 'string') overrides.code = body.code;

  if (isFieldErrors(body.fieldErrors)) {
    overrides.fieldErrors = body.fieldErrors;
  }

  return overrides;
}

function isFieldErrors(value: unknown): value is Record<string, string[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (messages) =>
      Array.isArray(messages) &&
      messages.every((message) => typeof message === 'string'),
  );
}

function getProblemDefaults(status: number): ProblemDefaults {
  const defaultsByStatus: Partial<Record<number, ProblemDefaults>> = {
    [HttpStatus.BAD_REQUEST]: {
      slug: 'bad-request',
      title: 'Requisição inválida',
      detail: 'Não foi possível processar a requisição.',
      code: 'BAD_REQUEST',
    },
    [HttpStatus.NOT_FOUND]: {
      slug: 'not-found',
      title: 'Recurso não encontrado',
      detail: 'O recurso solicitado não foi encontrado.',
      code: 'RESOURCE_NOT_FOUND',
    },
    [HttpStatus.UNAUTHORIZED]: {
      slug: 'unauthorized',
      title: 'Autenticação necessária',
      detail: 'A autenticação é necessária para acessar este recurso.',
      code: 'UNAUTHORIZED',
    },
    [HttpStatus.FORBIDDEN]: {
      slug: 'forbidden',
      title: 'Acesso negado',
      detail: 'Você não possui permissão para executar esta ação.',
      code: 'FORBIDDEN',
    },
    [HttpStatus.CONFLICT]: {
      slug: 'conflict',
      title: 'Conflito',
      detail: 'A operação conflita com o estado atual do recurso.',
      code: 'CONFLICT',
    },
    [HttpStatus.PAYLOAD_TOO_LARGE]: {
      slug: 'payload-too-large',
      title: 'Conteúdo muito grande',
      detail: 'O corpo da requisição excede o limite permitido.',
      code: 'PAYLOAD_TOO_LARGE',
    },
    [HttpStatus.UNPROCESSABLE_ENTITY]: {
      slug: 'validation-error',
      title: 'Dados inválidos',
      detail: 'Revise os campos informados.',
      code: 'VALIDATION_ERROR',
    },
    [HttpStatus.SERVICE_UNAVAILABLE]: {
      slug: 'service-unavailable',
      title: 'Serviço indisponível',
      detail: 'O serviço está temporariamente indisponível.',
      code: 'SERVICE_UNAVAILABLE',
    },
  };

  return (
    defaultsByStatus[status] ?? {
      slug: 'internal-server-error',
      title: 'Erro interno',
      detail: 'Ocorreu um erro inesperado.',
      code: 'INTERNAL_SERVER_ERROR',
    }
  );
}

function getHttpStatus(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }

  if (typeof exception !== 'object' || exception === null) {
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  const candidate = (exception as Record<string, unknown>).status;

  return typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate >= 400 &&
    candidate <= 599
    ? candidate
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

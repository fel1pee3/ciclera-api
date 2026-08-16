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
import { AuthenticationRejectedError } from '../auth/domain/authentication-rejected.error';
import {
  InvalidPasswordResetTokenError,
  PasswordResetDeliveryUnavailableError,
} from '../auth/domain/password-reset.errors';
import {
  EmptyUserUpdateError,
  LastOwnerRequiredError,
  ManagedUserNotFoundError,
  UserEmailAlreadyInUseError,
  UserManagementForbiddenError,
} from '../users/domain/user-management.errors';

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
  if (exception instanceof AuthenticationRejectedError) {
    return {
      type: 'https://ciclera.com.br/problems/invalid-credentials',
      title: 'Falha na autenticação',
      detail: 'E-mail, senha ou sessão inválidos.',
      code: 'INVALID_CREDENTIALS',
    };
  }

  if (exception instanceof InvalidPasswordResetTokenError) {
    return {
      type: 'https://ciclera.com.br/problems/invalid-password-reset-token',
      title: 'Redefinição não permitida',
      detail: 'O token de redefinição é inválido ou expirou.',
      code: 'INVALID_PASSWORD_RESET_TOKEN',
    };
  }

  if (exception instanceof PasswordResetDeliveryUnavailableError) {
    return {
      type: 'https://ciclera.com.br/problems/password-reset-unavailable',
      title: 'Recuperação indisponível',
      detail: 'Não foi possível enviar as instruções de recuperação.',
      code: 'PASSWORD_RESET_UNAVAILABLE',
    };
  }

  if (exception instanceof ManagedUserNotFoundError) {
    return {
      type: 'https://ciclera.com.br/problems/user-not-found',
      title: 'Usuário não encontrado',
      detail: 'O usuário solicitado não foi encontrado.',
      code: 'USER_NOT_FOUND',
    };
  }

  if (exception instanceof UserEmailAlreadyInUseError) {
    return {
      type: 'https://ciclera.com.br/problems/email-already-in-use',
      title: 'E-mail indisponível',
      detail: 'Já existe um usuário com este e-mail.',
      code: 'EMAIL_ALREADY_IN_USE',
    };
  }

  if (exception instanceof LastOwnerRequiredError) {
    return {
      type: 'https://ciclera.com.br/problems/last-owner-required',
      title: 'Último proprietário protegido',
      detail: 'A organização deve manter ao menos um proprietário ativo.',
      code: 'LAST_OWNER_REQUIRED',
    };
  }

  if (exception instanceof UserManagementForbiddenError) {
    return {
      type: 'https://ciclera.com.br/problems/user-management-forbidden',
      title: 'Acesso negado',
      detail: 'Seu perfil não pode gerenciar este usuário.',
      code: 'USER_MANAGEMENT_FORBIDDEN',
    };
  }

  if (exception instanceof EmptyUserUpdateError) {
    return {
      type: 'https://ciclera.com.br/problems/empty-user-update',
      title: 'Dados inválidos',
      detail: 'Informe ao menos um campo para alteração.',
      code: 'EMPTY_USER_UPDATE',
    };
  }

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
    [HttpStatus.TOO_MANY_REQUESTS]: {
      slug: 'too-many-requests',
      title: 'Muitas tentativas',
      detail: 'Aguarde antes de tentar novamente.',
      code: 'RATE_LIMITED',
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
  if (exception instanceof AuthenticationRejectedError) {
    return HttpStatus.UNAUTHORIZED;
  }

  if (exception instanceof InvalidPasswordResetTokenError) {
    return HttpStatus.BAD_REQUEST;
  }

  if (exception instanceof PasswordResetDeliveryUnavailableError) {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }

  if (exception instanceof ManagedUserNotFoundError) {
    return HttpStatus.NOT_FOUND;
  }

  if (exception instanceof UserEmailAlreadyInUseError) {
    return HttpStatus.CONFLICT;
  }

  if (exception instanceof LastOwnerRequiredError) {
    return HttpStatus.CONFLICT;
  }

  if (exception instanceof UserManagementForbiddenError) {
    return HttpStatus.FORBIDDEN;
  }

  if (exception instanceof EmptyUserUpdateError) {
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }

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

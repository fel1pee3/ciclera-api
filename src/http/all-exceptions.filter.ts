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
  PublicRegistrationDisabledError,
  PublicRegistrationEmailConflictError,
} from '../auth/domain/public-registration.errors';
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
import {
  ArchivedCustomerError,
  CustomerDocumentConflictError,
  CustomerManagementForbiddenError,
  CustomerNotFoundError,
  ServiceLocationNotFoundError,
} from '../customers/domain/customer.errors';
import {
  EquipmentManagementForbiddenError,
  EquipmentNotFoundError,
  EquipmentRelationInvalidError,
  EquipmentSerialConflictError,
} from '../equipment/domain/equipment.errors';
import {
  WorkOrderManagementForbiddenError,
  WorkOrderAssignmentInvalidError,
  WorkOrderExecutionAlreadyStartedError,
  WorkOrderExecutionNotFoundError,
  WorkOrderNotFoundError,
  WorkOrderRelationInvalidError,
  WorkOrderScheduleInvalidError,
  WorkOrderStatusLockedError,
  WorkOrderTechnicianInvalidError,
  WorkOrderVersionConflictError,
} from '../work-orders/domain/work-order.errors';
import {
  EvidenceLimitExceededError,
  EvidenceNotFoundError,
  EvidenceObjectMismatchError,
  EvidenceTokenInvalidError,
  EvidenceTypeInvalidError,
} from '../evidence/domain/evidence.errors';
import {
  AdditionalItemInvalidError,
  AdditionalItemNotFoundError,
} from '../additional-items/domain/additional-item.errors';
import {
  SubscriptionChangeInvalidError,
  SubscriptionCheckoutUnavailableError,
  SubscriptionLimitExceededError,
  SubscriptionOwnerRequiredError,
  SubscriptionRequiredError,
  SubscriptionWebhookUnauthorizedError,
  SubscriptionWebhookInvalidError,
  SubscriptionWriteRestrictedError,
} from '../subscriptions/domain/subscription.errors';

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
  if (exception instanceof SubscriptionRequiredError) {
    return {
      type: 'https://ciclera.com.br/problems/subscription-required',
      title: 'Assinatura necessária',
      detail:
        'Escolha um plano e confirme o pagamento para liberar alterações.',
      code: 'SUBSCRIPTION_REQUIRED',
    };
  }
  if (exception instanceof SubscriptionWriteRestrictedError) {
    return {
      type: 'https://ciclera.com.br/problems/subscription-restricted',
      title: 'Conta com alterações restritas',
      detail: 'Regularize a assinatura para voltar a criar ou alterar dados.',
      code: 'SUBSCRIPTION_WRITE_RESTRICTED',
    };
  }
  if (exception instanceof SubscriptionLimitExceededError) {
    return {
      type: 'https://ciclera.com.br/problems/subscription-limit',
      title: 'Limite do plano atingido',
      detail:
        'O plano atual não possui capacidade disponível para esta operação.',
      code: `SUBSCRIPTION_${exception.limit}_LIMIT`,
    };
  }
  if (exception instanceof SubscriptionOwnerRequiredError) {
    return {
      type: 'https://ciclera.com.br/problems/subscription-owner-required',
      title: 'Acesso do proprietário necessário',
      detail: 'Somente o proprietário pode administrar a assinatura.',
      code: 'SUBSCRIPTION_OWNER_REQUIRED',
    };
  }
  if (exception instanceof SubscriptionChangeInvalidError) {
    return {
      type: 'https://ciclera.com.br/problems/subscription-change-invalid',
      title: 'Alteração de plano indisponível',
      detail:
        'Revise o plano atual, os limites utilizados e a situação da assinatura.',
      code: 'SUBSCRIPTION_CHANGE_INVALID',
    };
  }
  if (exception instanceof SubscriptionCheckoutUnavailableError) {
    return {
      type: 'https://ciclera.com.br/problems/subscription-checkout-unavailable',
      title: 'Pagamento temporariamente indisponível',
      detail:
        'Não foi possível abrir o ambiente de pagamento. Tente novamente em instantes.',
      code: 'SUBSCRIPTION_CHECKOUT_UNAVAILABLE',
    };
  }
  if (exception instanceof SubscriptionWebhookUnauthorizedError) {
    return {
      type: 'https://ciclera.com.br/problems/webhook-unauthorized',
      title: 'Webhook não autorizado',
      detail: 'A autenticação do evento não foi aceita.',
      code: 'WEBHOOK_UNAUTHORIZED',
    };
  }
  if (exception instanceof SubscriptionWebhookInvalidError) {
    return {
      type: 'https://ciclera.com.br/problems/webhook-invalid',
      title: 'Evento inv\u00e1lido',
      detail: 'O evento recebido n\u00e3o possui o formato esperado.',
      code: 'WEBHOOK_INVALID',
    };
  }
  if (exception instanceof AuthenticationRejectedError) {
    return {
      type: 'https://ciclera.com.br/problems/invalid-credentials',
      title: 'Falha na autenticação',
      detail: 'E-mail, senha ou sessão inválidos.',
      code: 'INVALID_CREDENTIALS',
    };
  }

  if (exception instanceof PublicRegistrationDisabledError) {
    return {
      type: 'https://ciclera.com.br/problems/public-registration-disabled',
      title: 'Cadastro indispon\u00edvel',
      detail:
        'A cria\u00e7\u00e3o de novas contas est\u00e1 temporariamente indispon\u00edvel.',
      code: 'PUBLIC_REGISTRATION_DISABLED',
    };
  }

  if (exception instanceof PublicRegistrationEmailConflictError) {
    return {
      type: 'https://ciclera.com.br/problems/registration-email-conflict',
      title: 'E-mail indispon\u00edvel',
      detail: 'N\u00e3o foi poss\u00edvel criar uma conta com este e-mail.',
      code: 'REGISTRATION_EMAIL_CONFLICT',
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

  if (exception instanceof CustomerNotFoundError) {
    return {
      type: 'https://ciclera.com.br/problems/customer-not-found',
      title: 'Cliente não encontrado',
      detail: 'O cliente solicitado não foi encontrado.',
      code: 'CUSTOMER_NOT_FOUND',
    };
  }

  if (exception instanceof ServiceLocationNotFoundError) {
    return {
      type: 'https://ciclera.com.br/problems/location-not-found',
      title: 'Local não encontrado',
      detail: 'O local solicitado não foi encontrado.',
      code: 'LOCATION_NOT_FOUND',
    };
  }

  if (exception instanceof CustomerDocumentConflictError) {
    return {
      type: 'https://ciclera.com.br/problems/customer-document-conflict',
      title: 'Documento já cadastrado',
      detail: 'Já existe um cliente com este documento na organização.',
      code: 'CUSTOMER_DOCUMENT_CONFLICT',
    };
  }

  if (exception instanceof ArchivedCustomerError) {
    return {
      type: 'https://ciclera.com.br/problems/customer-archived',
      title: 'Cliente arquivado',
      detail: 'Não é possível adicionar locais a um cliente arquivado.',
      code: 'CUSTOMER_ARCHIVED',
    };
  }

  if (exception instanceof CustomerManagementForbiddenError) {
    return {
      type: 'https://ciclera.com.br/problems/customer-management-forbidden',
      title: 'Acesso negado',
      detail: 'Seu perfil não pode gerenciar clientes ou locais.',
      code: 'CUSTOMER_MANAGEMENT_FORBIDDEN',
    };
  }

  if (exception instanceof EquipmentNotFoundError) {
    return {
      type: 'https://ciclera.com.br/problems/equipment-not-found',
      title: 'Equipamento não encontrado',
      detail: 'O equipamento solicitado não foi encontrado.',
      code: 'EQUIPMENT_NOT_FOUND',
    };
  }

  if (exception instanceof EquipmentRelationInvalidError) {
    return {
      type: 'https://ciclera.com.br/problems/equipment-relation-invalid',
      title: 'Vínculo inválido',
      detail: 'Cliente e local devem estar ativos e pertencer à organização.',
      code: 'EQUIPMENT_RELATION_INVALID',
    };
  }

  if (exception instanceof EquipmentSerialConflictError) {
    return {
      type: 'https://ciclera.com.br/problems/equipment-serial-conflict',
      title: 'Serial já cadastrado',
      detail: 'Já existe um equipamento com este serial na organização.',
      code: 'EQUIPMENT_SERIAL_CONFLICT',
    };
  }

  if (exception instanceof EquipmentManagementForbiddenError) {
    return {
      type: 'https://ciclera.com.br/problems/equipment-management-forbidden',
      title: 'Acesso negado',
      detail: 'Seu perfil não pode gerenciar equipamentos.',
      code: 'EQUIPMENT_MANAGEMENT_FORBIDDEN',
    };
  }

  if (exception instanceof WorkOrderNotFoundError) {
    return {
      type: 'https://ciclera.com.br/problems/work-order-not-found',
      title: 'Ordem não encontrada',
      detail: 'A ordem de serviço solicitada não foi encontrada.',
      code: 'WORK_ORDER_NOT_FOUND',
    };
  }

  if (exception instanceof WorkOrderRelationInvalidError) {
    return {
      type: 'https://ciclera.com.br/problems/work-order-relation-invalid',
      title: 'Vínculo inválido',
      detail: 'Cliente, local e equipamento devem pertencer ao mesmo tenant.',
      code: 'WORK_ORDER_RELATION_INVALID',
    };
  }

  if (exception instanceof WorkOrderStatusLockedError) {
    return {
      type: 'https://ciclera.com.br/problems/work-order-status-locked',
      title: 'Ordem não editável',
      detail: 'O status atual não permite alterar estes campos.',
      code: 'WORK_ORDER_STATUS_LOCKED',
    };
  }

  if (exception instanceof WorkOrderVersionConflictError) {
    return {
      type: 'https://ciclera.com.br/problems/work-order-version-conflict',
      title: 'Ordem atualizada',
      detail: 'A ordem foi alterada por outra operação. Recarregue os dados.',
      code: 'WORK_ORDER_VERSION_CONFLICT',
    };
  }

  if (exception instanceof WorkOrderManagementForbiddenError) {
    return {
      type: 'https://ciclera.com.br/problems/work-order-management-forbidden',
      title: 'Acesso negado',
      detail: 'Seu perfil não pode administrar ordens de serviço.',
      code: 'WORK_ORDER_MANAGEMENT_FORBIDDEN',
    };
  }

  if (exception instanceof WorkOrderScheduleInvalidError) {
    return {
      type: 'https://ciclera.com.br/problems/work-order-schedule-invalid',
      title: 'Período inválido',
      detail: 'A data final deve ser posterior à data inicial.',
      code: 'WORK_ORDER_SCHEDULE_INVALID',
    };
  }

  if (exception instanceof WorkOrderTechnicianInvalidError) {
    return {
      type: 'https://ciclera.com.br/problems/work-order-technician-invalid',
      title: 'Técnico inválido',
      detail: 'Selecione um técnico ativo da organização.',
      code: 'WORK_ORDER_TECHNICIAN_INVALID',
    };
  }

  if (exception instanceof WorkOrderAssignmentInvalidError) {
    return {
      type: 'https://ciclera.com.br/problems/work-order-assignment-invalid',
      title: 'Atribuição inválida',
      detail: 'A ordem não possui uma atribuição ativa compatível.',
      code: 'WORK_ORDER_ASSIGNMENT_INVALID',
    };
  }

  if (exception instanceof WorkOrderExecutionAlreadyStartedError) {
    return {
      type: 'https://ciclera.com.br/problems/work-order-execution-started',
      title: 'Atendimento já iniciado',
      detail: 'Esta ordem já possui uma execução iniciada.',
      code: 'WORK_ORDER_EXECUTION_ALREADY_STARTED',
    };
  }

  if (exception instanceof WorkOrderExecutionNotFoundError) {
    return {
      type: 'https://ciclera.com.br/problems/work-order-execution-not-found',
      title: 'Execução não encontrada',
      detail: 'Inicie o atendimento antes de salvar o progresso.',
      code: 'WORK_ORDER_EXECUTION_NOT_FOUND',
    };
  }

  if (
    exception instanceof EvidenceNotFoundError ||
    exception instanceof EvidenceTokenInvalidError
  ) {
    return {
      type: 'https://ciclera.com.br/problems/evidence-not-found',
      title: 'Evidência não encontrada',
      detail: 'A evidência solicitada não está disponível.',
      code: 'EVIDENCE_NOT_FOUND',
    };
  }

  if (exception instanceof EvidenceLimitExceededError) {
    return {
      type: 'https://ciclera.com.br/problems/evidence-limit-exceeded',
      title: 'Limite de evidências atingido',
      detail: 'Remova uma evidência antes de adicionar outra.',
      code: 'EVIDENCE_LIMIT_EXCEEDED',
    };
  }

  if (exception instanceof EvidenceObjectMismatchError) {
    return {
      type: 'https://ciclera.com.br/problems/evidence-object-mismatch',
      title: 'Upload não confirmado',
      detail: 'O arquivo enviado não corresponde ao upload solicitado.',
      code: 'EVIDENCE_OBJECT_MISMATCH',
    };
  }

  if (exception instanceof EvidenceTypeInvalidError) {
    return {
      type: 'https://ciclera.com.br/problems/evidence-type-invalid',
      title: 'Arquivo não permitido',
      detail: 'O tipo ou tamanho do arquivo não é permitido.',
      code: 'EVIDENCE_TYPE_INVALID',
    };
  }

  if (exception instanceof AdditionalItemNotFoundError) {
    return {
      type: 'https://ciclera.com.br/problems/additional-item-not-found',
      title: 'Item adicional não encontrado',
      detail: 'O item adicional solicitado não foi encontrado.',
      code: 'ADDITIONAL_ITEM_NOT_FOUND',
    };
  }

  if (exception instanceof AdditionalItemInvalidError) {
    return {
      type: 'https://ciclera.com.br/problems/additional-item-invalid',
      title: 'Item adicional inválido',
      detail: 'Revise tipo, descrição, quantidade e valor unitário.',
      code: 'ADDITIONAL_ITEM_INVALID',
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
    [HttpStatus.PAYMENT_REQUIRED]: {
      slug: 'payment-required',
      title: 'Pagamento necessário',
      detail: 'Regularize a assinatura para continuar.',
      code: 'PAYMENT_REQUIRED',
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
    [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: {
      slug: 'unsupported-media-type',
      title: 'Formato n\u00e3o suportado',
      detail:
        'O formato do corpo da requisi\u00e7\u00e3o n\u00e3o \u00e9 suportado.',
      code: 'UNSUPPORTED_MEDIA_TYPE',
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
  if (
    exception instanceof SubscriptionRequiredError ||
    exception instanceof SubscriptionWriteRestrictedError
  ) {
    return HttpStatus.PAYMENT_REQUIRED;
  }
  if (exception instanceof SubscriptionOwnerRequiredError) {
    return HttpStatus.FORBIDDEN;
  }
  if (
    exception instanceof SubscriptionLimitExceededError ||
    exception instanceof SubscriptionChangeInvalidError
  ) {
    return HttpStatus.CONFLICT;
  }
  if (exception instanceof SubscriptionCheckoutUnavailableError) {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }
  if (exception instanceof SubscriptionWebhookUnauthorizedError) {
    return HttpStatus.UNAUTHORIZED;
  }
  if (exception instanceof SubscriptionWebhookInvalidError) {
    return HttpStatus.BAD_REQUEST;
  }
  if (exception instanceof AuthenticationRejectedError) {
    return HttpStatus.UNAUTHORIZED;
  }

  if (exception instanceof PublicRegistrationDisabledError) {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }

  if (exception instanceof PublicRegistrationEmailConflictError) {
    return HttpStatus.CONFLICT;
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

  if (
    exception instanceof CustomerNotFoundError ||
    exception instanceof ServiceLocationNotFoundError
  ) {
    return HttpStatus.NOT_FOUND;
  }

  if (
    exception instanceof CustomerDocumentConflictError ||
    exception instanceof ArchivedCustomerError
  ) {
    return HttpStatus.CONFLICT;
  }

  if (exception instanceof CustomerManagementForbiddenError) {
    return HttpStatus.FORBIDDEN;
  }

  if (exception instanceof EquipmentNotFoundError) {
    return HttpStatus.NOT_FOUND;
  }

  if (
    exception instanceof EquipmentRelationInvalidError ||
    exception instanceof EquipmentSerialConflictError
  ) {
    return HttpStatus.CONFLICT;
  }

  if (exception instanceof EquipmentManagementForbiddenError) {
    return HttpStatus.FORBIDDEN;
  }

  if (exception instanceof WorkOrderNotFoundError) {
    return HttpStatus.NOT_FOUND;
  }

  if (
    exception instanceof WorkOrderRelationInvalidError ||
    exception instanceof WorkOrderStatusLockedError ||
    exception instanceof WorkOrderVersionConflictError ||
    exception instanceof WorkOrderTechnicianInvalidError ||
    exception instanceof WorkOrderAssignmentInvalidError ||
    exception instanceof WorkOrderExecutionAlreadyStartedError ||
    exception instanceof WorkOrderExecutionNotFoundError
  ) {
    return HttpStatus.CONFLICT;
  }

  if (exception instanceof WorkOrderManagementForbiddenError) {
    return HttpStatus.FORBIDDEN;
  }

  if (exception instanceof WorkOrderScheduleInvalidError) {
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }

  if (
    exception instanceof EvidenceNotFoundError ||
    exception instanceof EvidenceTokenInvalidError
  ) {
    return HttpStatus.NOT_FOUND;
  }

  if (
    exception instanceof EvidenceLimitExceededError ||
    exception instanceof EvidenceObjectMismatchError
  ) {
    return HttpStatus.CONFLICT;
  }

  if (exception instanceof EvidenceTypeInvalidError) {
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }

  if (exception instanceof AdditionalItemNotFoundError) {
    return HttpStatus.NOT_FOUND;
  }

  if (exception instanceof AdditionalItemInvalidError) {
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

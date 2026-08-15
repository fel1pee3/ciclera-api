import {
  UnprocessableEntityException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';

type FieldErrors = Record<string, string[]>;

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    exceptionFactory: (errors) =>
      new UnprocessableEntityException({
        type: 'https://ciclera.com.br/problems/validation-error',
        title: 'Dados inválidos',
        detail: 'Revise os campos informados.',
        code: 'VALIDATION_ERROR',
        fieldErrors: collectFieldErrors(errors),
      }),
  });
}

function collectFieldErrors(
  errors: ValidationError[],
  parentPath = '',
  output: FieldErrors = {},
): FieldErrors {
  for (const error of errors) {
    const fieldPath = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const constraints = error.constraints ?? {};
    const messages = Object.entries(constraints).map(([name, message]) =>
      name === 'whitelistValidation' ? 'Campo não permitido.' : message,
    );

    if (messages.length > 0) {
      output[fieldPath] = messages;
    }

    collectFieldErrors(error.children ?? [], fieldPath, output);
  }

  return output;
}

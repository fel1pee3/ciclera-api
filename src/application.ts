import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { json } from 'express';
import { EnvironmentVariables, readEnvironment } from './config/environment';
import { AllExceptionsFilter } from './http/all-exceptions.filter';
import { requestIdMiddleware } from './http/request-id';
import { createRequestLoggingMiddleware } from './http/request-logging.middleware';
import { createValidationPipe } from './http/validation.pipe';
import { StructuredLoggerService } from './observability/structured-logger.service';
import { accessCookieName } from './auth/http/auth-cookies';
import { publicRegistrationBodyLimitBytes } from './auth/http/public-registration.guard';

export const apiPrefix = 'api/v1';

export function configureApplication(
  app: NestExpressApplication,
  environmentOverride?: EnvironmentVariables,
): void {
  const environment =
    environmentOverride ?? readEnvironment(app.get(ConfigService));
  const logger = app.get(StructuredLoggerService);

  if (environment.TRUST_PROXY_HOPS > 0) {
    app.set('trust proxy', environment.TRUST_PROXY_HOPS);
  }

  logger.setMinimumLevel(environment.LOG_LEVEL);
  app.useLogger(logger);

  app.use(requestIdMiddleware);
  app.use(createRequestLoggingMiddleware(logger));
  app.use(
    environment.NODE_ENV === 'development'
      ? helmet({ contentSecurityPolicy: false })
      : helmet(),
  );
  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      const isAllowed =
        origin === undefined || environment.CORS_ORIGINS.includes(origin);
      callback(null, isAllowed);
    },
  });
  app.use(
    `/${apiPrefix}/auth/register`,
    json({ limit: publicRegistrationBodyLimitBytes, type: 'application/json' }),
  );
  app.useBodyParser('json', { limit: environment.HTTP_BODY_LIMIT });
  app.useBodyParser('urlencoded', {
    extended: true,
    limit: environment.HTTP_BODY_LIMIT,
  });

  app.setGlobalPrefix(apiPrefix, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(logger));

  if (environment.NODE_ENV === 'development') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Ciclera API')
      .setDescription(
        'Contrato HTTP dos endpoints implementados na Ciclera API',
      )
      .setVersion('1.0')
      .addCookieAuth(accessCookieName, {
        type: 'apiKey',
        in: 'cookie',
        name: accessCookieName,
      })
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('docs', app, document);
  }

  app.enableShutdownHooks();
}

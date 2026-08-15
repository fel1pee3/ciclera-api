import { NextFunction, Response } from 'express';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import { getRequestId, RequestWithId } from './request-id';

export function createRequestLoggingMiddleware(
  logger: StructuredLoggerService,
): (request: RequestWithId, response: Response, next: NextFunction) => void {
  return (request, response, next): void => {
    const startedAt = process.hrtime.bigint();

    response.once('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      logger.log('http.request.completed', {
        requestId: getRequestId(request),
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });

    next();
  };
}

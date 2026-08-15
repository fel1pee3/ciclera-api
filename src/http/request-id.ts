import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export const requestIdHeader = 'x-request-id';
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const requestIdKey = Symbol('requestId');

export interface RequestWithId extends Request {
  [requestIdKey]?: string;
}

export function requestIdMiddleware(
  request: RequestWithId,
  response: Response,
  next: NextFunction,
): void {
  const candidate = request.header(requestIdHeader);
  const requestId = isValidRequestId(candidate)
    ? candidate
    : `req_${randomUUID()}`;

  request[requestIdKey] = requestId;
  response.setHeader(requestIdHeader, requestId);
  next();
}

export function getRequestId(request: RequestWithId): string {
  return request[requestIdKey] ?? `req_${randomUUID()}`;
}

function isValidRequestId(value: string | undefined): value is string {
  return value !== undefined && requestIdPattern.test(value);
}

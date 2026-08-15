import { Injectable, LoggerService } from '@nestjs/common';
import { ApplicationLogLevel } from '../config/environment';

type StructuredLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const levelWeights: Record<StructuredLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const sensitiveKeyPattern =
  /authorization|cookie|password|secret|token|credential/i;

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private minimumLevel: ApplicationLogLevel = 'info';

  setMinimumLevel(level: ApplicationLogLevel): void {
    this.minimumLevel = level;
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  private write(
    level: StructuredLogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    if (levelWeights[level] < levelWeights[this.minimumLevel]) {
      return;
    }

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message: sanitizeLogValue(message),
    };

    if (optionalParams.length > 0) {
      entry.metadata = sanitizeLogValue(optionalParams);
    }

    const output = `${JSON.stringify(entry)}\n`;

    if (levelWeights[level] >= levelWeights.error) {
      process.stderr.write(output);
      return;
    }

    process.stdout.write(output);
  }
}

export function sanitizeLogValue(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'undefined'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'symbol') {
    return value.description ?? '[SYMBOL]';
  }

  if (typeof value === 'function') {
    return `[FUNCTION:${value.name || 'anonymous'}]`;
  }

  if (depth >= 5 || seen.has(value)) {
    return '[TRUNCATED]';
  }

  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      stack: value.stack ? sanitizeString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, seen, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      sensitiveKeyPattern.test(key)
        ? '[REDACTED]'
        : sanitizeLogValue(nestedValue, seen, depth + 1),
    ]),
  );
}

function sanitizeString(value: string): string {
  if (/postgres(?:ql)?:\/\/[^\s@]+@/i.test(value)) {
    return '[REDACTED_DATABASE_URL]';
  }

  if (/[?&](?:x-amz-|x-goog-)?(?:signature|credential|token)=/i.test(value)) {
    return '[REDACTED_SIGNED_URL]';
  }

  return value;
}

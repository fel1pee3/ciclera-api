import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

const localWebOrigin = 'http://localhost:3000';

const postgresUrlSchema = z.string().min(1).refine(isPostgresUrl, {
  message: 'must be a valid PostgreSQL URL',
});

const rawEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3333),
  DATABASE_URL: postgresUrlSchema,
  TEST_DATABASE_URL: postgresUrlSchema.optional(),
  WEB_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().min(1).optional(),
  HTTP_BODY_LIMIT: z
    .string()
    .regex(/^\d+(?:kb|mb)$/i, 'must use a value such as 100kb or 1mb')
    .default('100kb'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  JWT_ACCESS_SECRET: z.string().min(32).max(4_096),
  JWT_ACCESS_ISSUER: z.string().min(3).max(200),
  JWT_ACCESS_AUDIENCE: z.string().min(3).max(200),
  ACCESS_TOKEN_TTL: z.coerce.number().int().min(60).max(3_600),
  REFRESH_TOKEN_TTL: z.coerce
    .number()
    .int()
    .min(3_600)
    .max(90 * 24 * 60 * 60),
  PASSWORD_RESET_TOKEN_TTL: z.coerce
    .number()
    .int()
    .min(300)
    .max(24 * 60 * 60)
    .default(1_800),
  PASSWORD_RESET_DELIVERY_MODE: z.enum(['local', 'disabled']).optional(),
});

export type NodeEnvironment = 'development' | 'test' | 'production';
export type ApplicationLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  DATABASE_URL: string;
  TEST_DATABASE_URL?: string;
  WEB_URL: string;
  CORS_ORIGINS: string[];
  HTTP_BODY_LIMIT: string;
  LOG_LEVEL: ApplicationLogLevel;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_ISSUER: string;
  JWT_ACCESS_AUDIENCE: string;
  ACCESS_TOKEN_TTL: number;
  REFRESH_TOKEN_TTL: number;
  PASSWORD_RESET_TOKEN_TTL: number;
  PASSWORD_RESET_DELIVERY_MODE: 'local' | 'disabled';
}

export function validateEnvironment(
  values: Record<string, unknown>,
): EnvironmentVariables {
  const parsed = rawEnvironmentSchema.safeParse(values);

  if (!parsed.success) {
    throwEnvironmentError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
      ),
    );
  }

  const issues: string[] = [];
  const { data } = parsed;

  if (data.NODE_ENV === 'production' && !data.WEB_URL) {
    issues.push('WEB_URL: is required in production');
  }

  if (data.NODE_ENV === 'production' && !data.CORS_ORIGINS) {
    issues.push('CORS_ORIGINS: is required in production');
  }

  if (data.NODE_ENV === 'test' && !data.TEST_DATABASE_URL) {
    issues.push('TEST_DATABASE_URL: is required in test');
  }

  const webUrl = normalizeWebUrl(data.WEB_URL ?? localWebOrigin, issues);
  const corsOrigins = parseCorsOrigins(data.CORS_ORIGINS ?? webUrl, issues);
  const passwordResetDeliveryMode =
    data.PASSWORD_RESET_DELIVERY_MODE ??
    (data.NODE_ENV === 'production' ? 'disabled' : 'local');

  if (data.NODE_ENV === 'production' && passwordResetDeliveryMode === 'local') {
    issues.push(
      'PASSWORD_RESET_DELIVERY_MODE: local delivery is forbidden in production',
    );
  }

  if (issues.length > 0) {
    throwEnvironmentError(issues);
  }

  return {
    NODE_ENV: data.NODE_ENV,
    PORT: data.PORT,
    DATABASE_URL: data.DATABASE_URL,
    TEST_DATABASE_URL: data.TEST_DATABASE_URL,
    WEB_URL: webUrl,
    CORS_ORIGINS: corsOrigins,
    HTTP_BODY_LIMIT: data.HTTP_BODY_LIMIT.toLowerCase(),
    LOG_LEVEL: data.LOG_LEVEL,
    JWT_ACCESS_SECRET: data.JWT_ACCESS_SECRET,
    JWT_ACCESS_ISSUER: data.JWT_ACCESS_ISSUER,
    JWT_ACCESS_AUDIENCE: data.JWT_ACCESS_AUDIENCE,
    ACCESS_TOKEN_TTL: data.ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL: data.REFRESH_TOKEN_TTL,
    PASSWORD_RESET_TOKEN_TTL: data.PASSWORD_RESET_TOKEN_TTL,
    PASSWORD_RESET_DELIVERY_MODE: passwordResetDeliveryMode,
  };
}

export function readEnvironment(
  configService: ConfigService,
): EnvironmentVariables {
  return {
    NODE_ENV: configService.getOrThrow<NodeEnvironment>('NODE_ENV'),
    PORT: configService.getOrThrow<number>('PORT'),
    DATABASE_URL: configService.getOrThrow<string>('DATABASE_URL'),
    TEST_DATABASE_URL: configService.get<string>('TEST_DATABASE_URL'),
    WEB_URL: configService.getOrThrow<string>('WEB_URL'),
    CORS_ORIGINS: configService.getOrThrow<string[]>('CORS_ORIGINS'),
    HTTP_BODY_LIMIT: configService.getOrThrow<string>('HTTP_BODY_LIMIT'),
    LOG_LEVEL: configService.getOrThrow<ApplicationLogLevel>('LOG_LEVEL'),
    JWT_ACCESS_SECRET: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    JWT_ACCESS_ISSUER: configService.getOrThrow<string>('JWT_ACCESS_ISSUER'),
    JWT_ACCESS_AUDIENCE: configService.getOrThrow<string>(
      'JWT_ACCESS_AUDIENCE',
    ),
    ACCESS_TOKEN_TTL: configService.getOrThrow<number>('ACCESS_TOKEN_TTL'),
    REFRESH_TOKEN_TTL: configService.getOrThrow<number>('REFRESH_TOKEN_TTL'),
    PASSWORD_RESET_TOKEN_TTL: configService.getOrThrow<number>(
      'PASSWORD_RESET_TOKEN_TTL',
    ),
    PASSWORD_RESET_DELIVERY_MODE: configService.getOrThrow<
      'local' | 'disabled'
    >('PASSWORD_RESET_DELIVERY_MODE'),
  };
}

export function getRuntimeDatabaseUrl(
  environment: EnvironmentVariables,
): string {
  if (environment.NODE_ENV === 'test') {
    if (!environment.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required in test.');
    }

    return environment.TEST_DATABASE_URL;
  }

  return environment.DATABASE_URL;
}

function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'postgresql:' || url.protocol === 'postgres:') &&
      url.pathname.length > 1
    );
  } catch {
    return false;
  }
}

function normalizeWebUrl(value: string, issues: string[]): string {
  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      issues.push('WEB_URL: must use http or https');
    }

    return url.origin;
  } catch {
    issues.push('WEB_URL: must be a valid URL');
    return localWebOrigin;
  }
}

function parseCorsOrigins(value: string, issues: string[]): string[] {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    issues.push('CORS_ORIGINS: must contain at least one origin');
    return [];
  }

  const normalizedOrigins = origins.flatMap((origin) => {
    try {
      const url = new URL(origin);
      const hasOnlyOrigin =
        url.pathname === '/' && !url.search && !url.hash && !url.username;
      const hasAllowedProtocol =
        url.protocol === 'http:' || url.protocol === 'https:';

      if (!hasOnlyOrigin || !hasAllowedProtocol || url.password) {
        issues.push(
          'CORS_ORIGINS: each item must be an HTTP(S) origin without path or credentials',
        );
        return [];
      }

      return [url.origin];
    } catch {
      issues.push('CORS_ORIGINS: contains an invalid origin');
      return [];
    }
  });

  return [...new Set(normalizedOrigins)];
}

function throwEnvironmentError(issues: string[]): never {
  throw new Error(`Invalid environment configuration: ${issues.join('; ')}`);
}

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
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).optional(),
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
  PASSWORD_RESET_DELIVERY_MODE: z
    .enum(['local', 'disabled', 'resend'])
    .optional(),
  RESEND_API_KEY: z.string().min(20).max(4_096).optional(),
  EMAIL_FROM: z.string().min(3).max(320).optional(),
  PUBLIC_REGISTRATION_ENABLED: z.enum(['true', 'false']).default('false'),
  AUTH_COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  EVIDENCE_STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  EVIDENCE_STORAGE_ROOT: z.string().min(1).default('.local/evidence'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SECRET_KEY: z.string().min(20).max(4_096).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(3).max(63).optional(),
  UPLOAD_MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(25 * 1_024 * 1_024)
    .default(10 * 1_024 * 1_024),
  UPLOAD_ALLOWED_MIME_TYPES: z
    .string()
    .min(1)
    .default('image/jpeg,image/png,image/webp'),
  UPLOAD_MAX_FILES_PER_EXECUTION: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20),
  EVIDENCE_URL_TTL: z.coerce.number().int().min(60).max(900).default(300),
  RATE_LIMIT_STORAGE_DRIVER: z.enum(['memory', 'upstash']).default('memory'),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(20).max(4_096).optional(),
  SUBSCRIPTION_ENFORCEMENT_ENABLED: z.enum(['true', 'false']).optional(),
  ASAAS_API_URL: z.string().url().optional(),
  ASAAS_API_KEY: z.string().min(20).max(4_096).optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().min(32).max(255).optional(),
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
  TRUST_PROXY_HOPS: number;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_ISSUER: string;
  JWT_ACCESS_AUDIENCE: string;
  ACCESS_TOKEN_TTL: number;
  REFRESH_TOKEN_TTL: number;
  PASSWORD_RESET_TOKEN_TTL: number;
  PASSWORD_RESET_DELIVERY_MODE: 'local' | 'disabled' | 'resend';
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  PUBLIC_REGISTRATION_ENABLED: boolean;
  AUTH_COOKIE_SAME_SITE: 'strict' | 'lax' | 'none';
  EVIDENCE_STORAGE_DRIVER: 'local' | 'supabase';
  EVIDENCE_STORAGE_ROOT: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_STORAGE_BUCKET?: string;
  UPLOAD_MAX_FILE_SIZE_BYTES: number;
  UPLOAD_ALLOWED_MIME_TYPES: string[];
  UPLOAD_MAX_FILES_PER_EXECUTION: number;
  EVIDENCE_URL_TTL: number;
  RATE_LIMIT_STORAGE_DRIVER: 'memory' | 'upstash';
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  SUBSCRIPTION_ENFORCEMENT_ENABLED: boolean;
  ASAAS_API_URL?: string;
  ASAAS_API_KEY?: string;
  ASAAS_WEBHOOK_TOKEN?: string;
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

  if (data.NODE_ENV === 'test' && data.TEST_DATABASE_URL) {
    validateTestDatabaseIsolation(
      data.DATABASE_URL,
      data.TEST_DATABASE_URL,
      issues,
    );
  }

  const webUrl = normalizeWebUrl(data.WEB_URL ?? localWebOrigin, issues);
  const corsOrigins = parseCorsOrigins(data.CORS_ORIGINS ?? webUrl, issues);
  const passwordResetDeliveryMode =
    data.PASSWORD_RESET_DELIVERY_MODE ??
    (data.NODE_ENV === 'production' ? 'disabled' : 'local');

  if (data.NODE_ENV === 'production') {
    if (!webUrl.startsWith('https://')) {
      issues.push('WEB_URL: production requires https');
    }
    if (corsOrigins.some((origin) => !origin.startsWith('https://'))) {
      issues.push('CORS_ORIGINS: production requires https origins');
    }
  }

  if (data.NODE_ENV === 'production' && passwordResetDeliveryMode === 'local') {
    issues.push(
      'PASSWORD_RESET_DELIVERY_MODE: local delivery is forbidden in production',
    );
  }

  if (passwordResetDeliveryMode === 'resend') {
    if (!data.RESEND_API_KEY) {
      issues.push('RESEND_API_KEY: is required');
    }
    if (!data.EMAIL_FROM) {
      issues.push('EMAIL_FROM: is required');
    } else if (!isValidEmailSender(data.EMAIL_FROM)) {
      issues.push(
        'EMAIL_FROM: must be an email address or a name followed by an email address in angle brackets',
      );
    }
  }

  if (data.AUTH_COOKIE_SAME_SITE === 'none' && data.NODE_ENV !== 'production') {
    issues.push(
      'AUTH_COOKIE_SAME_SITE: none is allowed only in production because it requires Secure cookies',
    );
  }

  if (data.EVIDENCE_STORAGE_DRIVER === 'supabase') {
    if (!data.SUPABASE_URL) issues.push('SUPABASE_URL: is required');
    if (!data.SUPABASE_SECRET_KEY) {
      issues.push('SUPABASE_SECRET_KEY: is required');
    }
    if (!data.SUPABASE_STORAGE_BUCKET) {
      issues.push('SUPABASE_STORAGE_BUCKET: is required');
    }
    if (
      data.NODE_ENV === 'production' &&
      data.SUPABASE_URL &&
      !data.SUPABASE_URL.startsWith('https://')
    ) {
      issues.push('SUPABASE_URL: production requires https');
    }
  }

  if (data.RATE_LIMIT_STORAGE_DRIVER === 'upstash') {
    if (!data.UPSTASH_REDIS_REST_URL) {
      issues.push('UPSTASH_REDIS_REST_URL: is required');
    }
    if (!data.UPSTASH_REDIS_REST_TOKEN) {
      issues.push('UPSTASH_REDIS_REST_TOKEN: is required');
    }
    if (
      data.NODE_ENV === 'production' &&
      data.UPSTASH_REDIS_REST_URL &&
      !data.UPSTASH_REDIS_REST_URL.startsWith('https://')
    ) {
      issues.push('UPSTASH_REDIS_REST_URL: production requires https');
    }
  }

  if (
    data.NODE_ENV === 'production' &&
    data.EVIDENCE_STORAGE_DRIVER !== 'supabase'
  ) {
    issues.push(
      'EVIDENCE_STORAGE_DRIVER: production requires supabase storage',
    );
  }

  const subscriptionEnforcementEnabled =
    data.SUBSCRIPTION_ENFORCEMENT_ENABLED === 'true';
  if (
    data.NODE_ENV === 'production' &&
    data.SUBSCRIPTION_ENFORCEMENT_ENABLED === undefined
  ) {
    issues.push(
      'SUBSCRIPTION_ENFORCEMENT_ENABLED: must be explicitly configured in production',
    );
  }
  if (subscriptionEnforcementEnabled) {
    if (!data.ASAAS_API_URL) issues.push('ASAAS_API_URL: is required');
    if (!data.ASAAS_API_KEY) issues.push('ASAAS_API_KEY: is required');
    if (!data.ASAAS_WEBHOOK_TOKEN)
      issues.push('ASAAS_WEBHOOK_TOKEN: is required');
    if (
      data.NODE_ENV === 'production' &&
      data.ASAAS_API_URL !== 'https://api.asaas.com/v3'
    ) {
      issues.push(
        'ASAAS_API_URL: production requires https://api.asaas.com/v3',
      );
    }
  }

  if (
    data.NODE_ENV === 'production' &&
    data.RATE_LIMIT_STORAGE_DRIVER !== 'upstash'
  ) {
    issues.push(
      'RATE_LIMIT_STORAGE_DRIVER: production requires upstash rate limiting',
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
    TRUST_PROXY_HOPS:
      data.TRUST_PROXY_HOPS ?? (data.NODE_ENV === 'production' ? 1 : 0),
    JWT_ACCESS_SECRET: data.JWT_ACCESS_SECRET,
    JWT_ACCESS_ISSUER: data.JWT_ACCESS_ISSUER,
    JWT_ACCESS_AUDIENCE: data.JWT_ACCESS_AUDIENCE,
    ACCESS_TOKEN_TTL: data.ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL: data.REFRESH_TOKEN_TTL,
    PASSWORD_RESET_TOKEN_TTL: data.PASSWORD_RESET_TOKEN_TTL,
    PASSWORD_RESET_DELIVERY_MODE: passwordResetDeliveryMode,
    RESEND_API_KEY: data.RESEND_API_KEY,
    EMAIL_FROM: data.EMAIL_FROM,
    PUBLIC_REGISTRATION_ENABLED: data.PUBLIC_REGISTRATION_ENABLED === 'true',
    AUTH_COOKIE_SAME_SITE: data.AUTH_COOKIE_SAME_SITE,
    EVIDENCE_STORAGE_DRIVER: data.EVIDENCE_STORAGE_DRIVER,
    EVIDENCE_STORAGE_ROOT: data.EVIDENCE_STORAGE_ROOT,
    SUPABASE_URL: data.SUPABASE_URL,
    SUPABASE_SECRET_KEY: data.SUPABASE_SECRET_KEY,
    SUPABASE_STORAGE_BUCKET: data.SUPABASE_STORAGE_BUCKET,
    UPLOAD_MAX_FILE_SIZE_BYTES: data.UPLOAD_MAX_FILE_SIZE_BYTES,
    UPLOAD_ALLOWED_MIME_TYPES: data.UPLOAD_ALLOWED_MIME_TYPES.split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    UPLOAD_MAX_FILES_PER_EXECUTION: data.UPLOAD_MAX_FILES_PER_EXECUTION,
    EVIDENCE_URL_TTL: data.EVIDENCE_URL_TTL,
    RATE_LIMIT_STORAGE_DRIVER: data.RATE_LIMIT_STORAGE_DRIVER,
    UPSTASH_REDIS_REST_URL: data.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: data.UPSTASH_REDIS_REST_TOKEN,
    SUBSCRIPTION_ENFORCEMENT_ENABLED: subscriptionEnforcementEnabled,
    ASAAS_API_URL: data.ASAAS_API_URL,
    ASAAS_API_KEY: data.ASAAS_API_KEY,
    ASAAS_WEBHOOK_TOKEN: data.ASAAS_WEBHOOK_TOKEN,
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
    TRUST_PROXY_HOPS: configService.getOrThrow<number>('TRUST_PROXY_HOPS'),
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
      'local' | 'disabled' | 'resend'
    >('PASSWORD_RESET_DELIVERY_MODE'),
    RESEND_API_KEY: configService.get<string>('RESEND_API_KEY'),
    EMAIL_FROM: configService.get<string>('EMAIL_FROM'),
    PUBLIC_REGISTRATION_ENABLED: configService.getOrThrow<boolean>(
      'PUBLIC_REGISTRATION_ENABLED',
    ),
    AUTH_COOKIE_SAME_SITE: configService.getOrThrow<'strict' | 'lax' | 'none'>(
      'AUTH_COOKIE_SAME_SITE',
    ),
    EVIDENCE_STORAGE_DRIVER: configService.getOrThrow<'local' | 'supabase'>(
      'EVIDENCE_STORAGE_DRIVER',
    ),
    EVIDENCE_STORAGE_ROOT: configService.getOrThrow<string>(
      'EVIDENCE_STORAGE_ROOT',
    ),
    SUPABASE_URL: configService.get<string>('SUPABASE_URL'),
    SUPABASE_SECRET_KEY: configService.get<string>('SUPABASE_SECRET_KEY'),
    SUPABASE_STORAGE_BUCKET: configService.get<string>(
      'SUPABASE_STORAGE_BUCKET',
    ),
    UPLOAD_MAX_FILE_SIZE_BYTES: configService.getOrThrow<number>(
      'UPLOAD_MAX_FILE_SIZE_BYTES',
    ),
    UPLOAD_ALLOWED_MIME_TYPES: configService.getOrThrow<string[]>(
      'UPLOAD_ALLOWED_MIME_TYPES',
    ),
    UPLOAD_MAX_FILES_PER_EXECUTION: configService.getOrThrow<number>(
      'UPLOAD_MAX_FILES_PER_EXECUTION',
    ),
    EVIDENCE_URL_TTL: configService.getOrThrow<number>('EVIDENCE_URL_TTL'),
    RATE_LIMIT_STORAGE_DRIVER: configService.getOrThrow<'memory' | 'upstash'>(
      'RATE_LIMIT_STORAGE_DRIVER',
    ),
    UPSTASH_REDIS_REST_URL: configService.get<string>('UPSTASH_REDIS_REST_URL'),
    UPSTASH_REDIS_REST_TOKEN: configService.get<string>(
      'UPSTASH_REDIS_REST_TOKEN',
    ),
    SUBSCRIPTION_ENFORCEMENT_ENABLED: configService.getOrThrow<boolean>(
      'SUBSCRIPTION_ENFORCEMENT_ENABLED',
    ),
    ASAAS_API_URL: configService.get<string>('ASAAS_API_URL'),
    ASAAS_API_KEY: configService.get<string>('ASAAS_API_KEY'),
    ASAAS_WEBHOOK_TOKEN: configService.get<string>('ASAAS_WEBHOOK_TOKEN'),
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

function isValidEmailSender(value: string): boolean {
  const normalized = value.trim();
  const address = normalized.endsWith('>')
    ? normalized.slice(normalized.lastIndexOf('<') + 1, -1)
    : normalized;

  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address);
}

function validateTestDatabaseIsolation(
  databaseUrlValue: string,
  testDatabaseUrlValue: string,
  issues: string[],
): void {
  const databaseUrl = new URL(databaseUrlValue);
  const testDatabaseUrl = new URL(testDatabaseUrlValue);
  const databaseSchema = databaseUrl.searchParams.get('schema');
  const testSchema = testDatabaseUrl.searchParams.get('schema');
  const sameConnection =
    databaseUrl.protocol === testDatabaseUrl.protocol &&
    databaseUrl.hostname === testDatabaseUrl.hostname &&
    databaseUrl.port === testDatabaseUrl.port &&
    databaseUrl.username === testDatabaseUrl.username &&
    databaseUrl.pathname === testDatabaseUrl.pathname;

  if (databaseSchema && databaseSchema !== 'public') {
    issues.push('DATABASE_URL: must use the public schema');
  }

  if (!sameConnection) {
    issues.push('TEST_DATABASE_URL: must use the configured local database');
  }

  if (!testSchema || !/^ciclera_test_[a-z0-9_]+$/.test(testSchema)) {
    issues.push('TEST_DATABASE_URL: must use an isolated test schema');
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

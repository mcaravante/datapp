import { z } from 'zod';

/**
 * Validated environment for the API + worker entry points. Read once at
 * boot via `loadEnv()`; the Nest `ConfigService` re-exposes the same shape.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 chars'),
  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
  ENCRYPTION_MASTER_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'ENCRYPTION_MASTER_KEY must be 32 bytes hex'),

  APP_URL_API: z.string().url(),
  APP_URL_ADMIN: z.string().url(),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ),

  MAGENTO_BASE_URL: z.string().url().optional(),
  MAGENTO_ADMIN_TOKEN: z.string().optional(),
  MAGENTO_HMAC_SECRET: z.string().optional(),
  MAGENTO_RATE_LIMIT_RPS: z.coerce.number().int().min(1).max(100).default(4),

  SENTRY_DSN_API: z.string().url().optional().or(z.literal('')),
  SENTRY_ENVIRONMENT: z.string().default('development'),

  DEFAULT_TIMEZONE: z.string().default('America/Argentina/Buenos_Aires'),
  DEFAULT_TENANT_SLUG: z.string().default('acme'),
  FEATURE_2FA_ENFORCED: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .default('false')
    .transform((v) => v === true || v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

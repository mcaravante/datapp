import { z } from 'zod';

/**
 * Validated environment for the API + worker entry points. Read once at
 * boot via `loadEnv()`; the Nest `ConfigService` re-exposes the same shape.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3010),

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

  // SMTP — used by the password-reset mailer. All optional: when SMTP_HOST
  // is unset, the mailer logs the message to stdout instead of sending,
  // which keeps `pnpm dev` workable without an SMTP account.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .default('false')
    .transform((v) => v === true || v === 'true'),
  SMTP_FROM: z.string().default('Datapp <no-reply@datapp.com.ar>'),

  DEFAULT_TIMEZONE: z.string().default('America/Argentina/Buenos_Aires'),
  DEFAULT_TENANT_SLUG: z.string().default('acme'),
  FEATURE_2FA_ENFORCED: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .default('false')
    .transform((v) => v === true || v === 'true'),

  // Google Sign-In ----------------------------------------------------
  // Verified against the `aud` claim of the id_token. If empty, the
  // Google login endpoint refuses every request.
  GOOGLE_CLIENT_ID: z.string().default(''),
  // Auto-bootstraps a super_admin row the first time this email signs
  // in via Google. Empty string disables the bootstrap (the first
  // user must then be created via CLI / SQL). When an `admin@cdp.local`
  // seed row exists and OWNER_EMAIL has no matching user, we migrate
  // the seed row to OWNER_EMAIL so audit history follows the owner.
  OWNER_EMAIL: z.string().default(''),

  // Phase 3 — Email engine (abandoned-cart recovery vertical) ---------
  // See docs/adr/0007-phase3-abandoned-cart-recovery-vertical.md.
  //
  // Master toggle. While false, all Phase 3 modules register no
  // routes/processors and the system behaves as Phase 1.
  EMAIL_ENGINE_ENABLED: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .default('false')
    .transform((v) => v === true || v === 'true'),
  // Safety harness. While true, only addresses listed in
  // EMAIL_TEST_RECIPIENT_ALLOWLIST receive emails — others are recorded
  // as `EmailSend.status='suppressed'` with reason `test_allowlist`.
  // Default true so dev / staging cannot leak real customer mail.
  EMAIL_DRY_RUN: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .default('true')
    .transform((v) => v === true || v === 'true'),
  // Comma-separated list of allowed recipients while EMAIL_DRY_RUN is on.
  EMAIL_TEST_RECIPIENT_ALLOWLIST: z
    .string()
    .default('matias.caravante@gmail.com')
    .transform((s) =>
      s
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
    ),
  // Max recovery emails to a given address in a 24h window.
  EMAIL_FREQUENCY_CAP_24H: z.coerce.number().int().min(0).max(20).default(3),
  // Resend SDK + webhook config. Required at boot when EMAIL_ENGINE_ENABLED
  // is true (cross-validated below).
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default('CDP <no-reply@datapp.com.ar>'),
  RESEND_REPLY_TO: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  // Public storefront base URL for building recovery URLs. Distinct from
  // MAGENTO_BASE_URL (which is the admin REST endpoint).
  MAGENTO_STOREFRONT_URL: z.string().url().optional(),
})
.superRefine((env, ctx) => {
  if (!env.EMAIL_ENGINE_ENABLED) return;
  // Storefront URL is the only hard requirement: prepare-send needs it
  // to build recovery URLs. RESEND_API_KEY + RESEND_WEBHOOK_SECRET stay
  // optional so operators can configure templates/campaigns first and
  // wire Resend later. Sends will fail with a clear "Resend not
  // initialized" error if dispatched without the key.
  if (!env.MAGENTO_STOREFRONT_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MAGENTO_STOREFRONT_URL'],
      message: 'MAGENTO_STOREFRONT_URL is required when EMAIL_ENGINE_ENABLED=true',
    });
  }
  if (env.RESEND_WEBHOOK_SECRET && env.RESEND_WEBHOOK_SECRET.length < 16) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RESEND_WEBHOOK_SECRET'],
      message: 'RESEND_WEBHOOK_SECRET must be at least 16 chars',
    });
  }
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

import { z } from 'zod';

/**
 * Server-only env validation. Read once at import time so the process
 * fails fast on misconfiguration.
 */
const ServerEnvSchema = z.object({
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url(),
  APP_URL_API: z.string().url(),
  DEFAULT_TIMEZONE: z.string().default('America/Argentina/Buenos_Aires'),
  // Google OAuth — empty disables the "Iniciar con Google" button.
  AUTH_GOOGLE_ID: z.string().default(''),
  AUTH_GOOGLE_SECRET: z.string().default(''),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid admin environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

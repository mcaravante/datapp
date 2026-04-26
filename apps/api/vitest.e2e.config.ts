import { defineConfig } from 'vitest/config';

/**
 * E2E / integration config.
 *
 * Runs against the real Postgres + Redis (whatever DATABASE_URL /
 * REDIS_URL point to). Tests bootstrap a full Nest application via
 * `Test.createTestingModule(AppModule)`.
 *
 * Env loading: caller must set DATABASE_URL, REDIS_URL, AUTH_SECRET,
 * JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, ENCRYPTION_MASTER_KEY before
 * invoking. The repo root provides `.env`; CI provides them via job env.
 *
 * Vitest runs worker-pooled by default, but argon2's native bindings +
 * Nest's DI graph aborts under that mode on macOS; we serialize in the
 * main thread instead.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true, isolate: false } },
    fileParallelism: false,
  },
});

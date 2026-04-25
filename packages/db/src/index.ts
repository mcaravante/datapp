import { PrismaClient } from '../generated/client/index.js';

export type { PrismaClient } from '../generated/client/index.js';
export * from '../generated/client/index.js';

/**
 * Singleton Prisma client. Use `getPrismaClient()` from anywhere; the same
 * instance is reused across the process so the connection pool is shared.
 *
 * Tests should call `disconnectPrismaClient()` in afterAll hooks.
 */
let client: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      log: process.env['NODE_ENV'] === 'production' ? ['warn', 'error'] : ['warn', 'error'],
    });
  }
  return client;
}

export async function disconnectPrismaClient(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

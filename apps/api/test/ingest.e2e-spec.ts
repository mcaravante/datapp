/**
 * End-to-end integration test for the Magento webhook ingest pipeline.
 *
 * Talks HTTP against an externally-running API (env: `E2E_API_URL`,
 * default `http://localhost:3010`) and the same Postgres the API uses
 * (env: `DATABASE_URL`). Each run creates a fresh tenant + magento_store
 * with a unique slug and tears them down on exit.
 *
 * Local: `pnpm exec dotenv -e .env -- node apps/api/dist/main.js &`
 *        then `pnpm --filter @cdp/api test:e2e`.
 * CI: the workflow boots the API container before the test step.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@cdp/db';
import { computeHmac } from '../src/modules/sync/hmac';
import { INGEST_REPLAY_WINDOW_SECONDS } from '@cdp/shared/ingest';
import { createCipheriv, randomBytes as cryptoRandomBytes } from 'node:crypto';

// Stand-alone AES-256-GCM (matches CryptoService) so the test can write
// encrypted columns without booting Nest.
function encryptForStore(plaintext: string, hexKey: string): Buffer {
  const key = Buffer.from(hexKey, 'hex');
  const iv = cryptoRandomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:3010';
const ENCRYPTION_KEY = process.env['ENCRYPTION_MASTER_KEY'] ?? '';

let prisma: PrismaClient;
const tenantSlug = `e2e-${randomUUID().slice(0, 8)}`;
const storeName = `e2e-store-${randomUUID().slice(0, 8)}`;
const hmacSecret = randomBytes(32).toString('hex');
let tenantId = '';

beforeAll(async () => {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    throw new Error('ENCRYPTION_MASTER_KEY (32-byte hex) is required');
  }
  // Probe the API. The error message guides operators to start it.
  const probe = await fetch(`${API_URL}/v1/health`).catch((e: unknown) => e);
  if (probe instanceof Error || (probe as Response).status !== 200) {
    throw new Error(
      `API at ${API_URL} is not responding to /v1/health. Boot it before running e2e tests.`,
    );
  }

  prisma = new PrismaClient();
  await prisma.$connect();

  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: tenantSlug, settings: {} },
    select: { id: true },
  });
  tenantId = tenant.id;

  await prisma.magentoStore.create({
    data: {
      tenantId,
      name: storeName,
      baseUrl: 'http://magento.invalid',
      adminTokenEncrypted: encryptForStore('not-real', ENCRYPTION_KEY),
      hmacSecretEncrypted: encryptForStore(hmacSecret, ENCRYPTION_KEY),
      currencyCode: 'ARS',
      defaultCountry: 'AR',
      isActive: true,
    },
  });
}, 60_000);

afterAll(async () => {
  if (prisma && tenantId) {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}, 30_000);

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

interface MakeBodyOptions {
  eventId?: string;
  eventType?: string;
}

function makeBody(opts: MakeBodyOptions = {}): {
  raw: string;
  envelope: {
    event_id: string;
    event_type: string;
    occurred_at: string;
    magento_entity_id: string;
    payload: Record<string, unknown>;
  };
} {
  const envelope = {
    event_id: opts.eventId ?? randomUUID(),
    event_type: opts.eventType ?? 'customer.updated',
    occurred_at: new Date().toISOString(),
    magento_entity_id: '123',
    payload: { id: 123, email: 'e2e@example.com' },
  };
  return { raw: JSON.stringify(envelope), envelope };
}

interface SignedHeadersOverrides {
  tenantSlug?: string;
  storeName?: string;
  timestamp?: number;
  signature?: string;
  eventId?: string;
}

function signedHeaders(
  rawBody: string,
  overrides: SignedHeadersOverrides = {},
): Record<string, string> {
  const tenant = overrides.tenantSlug ?? tenantSlug;
  const store = overrides.storeName ?? storeName;
  const ts = (overrides.timestamp ?? nowSeconds()).toString();
  const sig = overrides.signature ?? computeHmac(hmacSecret, ts, rawBody);
  const eventId = overrides.eventId ?? randomUUID();
  return {
    'content-type': 'application/json',
    'x-crm-tenant': tenant,
    'x-crm-store': store,
    'x-crm-timestamp': ts,
    'x-crm-signature': sig,
    'x-crm-event-id': eventId,
  };
}

async function postIngest(rawBody: string, headers: Record<string, string>): Promise<Response> {
  return fetch(`${API_URL}/v1/ingest/magento/events`, {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

describe('POST /v1/ingest/magento/events', () => {
  it('accepts a correctly signed event and persists sync_event_log', async () => {
    const eventId = randomUUID();
    const { raw } = makeBody({ eventId });
    const res = await postIngest(raw, signedHeaders(raw));
    expect(res.status).toBe(202);
    const body = (await res.json()) as { status: string; event_id: string };
    expect(body).toEqual({ status: 'enqueued', event_id: eventId });

    const log = await prisma.syncEventLog.findUnique({ where: { eventId } });
    expect(log).not.toBeNull();
    expect(log?.eventType).toBe('customer_updated');
    expect(log?.magentoEntityId).toBe('123');
    expect(log?.status).toBe('pending');
  });

  it('returns 401 when the signature is missing', async () => {
    const { raw } = makeBody();
    const headers = { ...(signedHeaders(raw) as Record<string, string>) };
    delete headers['x-crm-signature'];
    const res = await postIngest(raw, headers);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the signature is wrong', async () => {
    const { raw } = makeBody();
    const headers = signedHeaders(raw, { signature: 'a'.repeat(64) });
    const res = await postIngest(raw, headers);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the body has been tampered after signing', async () => {
    const { raw } = makeBody();
    const headers = signedHeaders(raw);
    const tampered = raw.replace('"123"', '"999"');
    const res = await postIngest(tampered, headers);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the timestamp is outside the replay window', async () => {
    const { raw } = makeBody();
    const stale = nowSeconds() - INGEST_REPLAY_WINDOW_SECONDS - 60;
    const headers = signedHeaders(raw, { timestamp: stale });
    const res = await postIngest(raw, headers);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the tenant slug does not exist', async () => {
    const { raw } = makeBody();
    const headers = signedHeaders(raw, { tenantSlug: 'no-such-tenant' });
    const res = await postIngest(raw, headers);
    expect(res.status).toBe(401);
  });

  it('replay of the same event_id is idempotent — second call returns duplicate', async () => {
    const eventId = randomUUID();
    const { raw } = makeBody({ eventId });

    const first = await postIngest(raw, signedHeaders(raw));
    expect(first.status).toBe(202);
    expect(((await first.json()) as { status: string }).status).toBe('enqueued');

    const second = await postIngest(raw, signedHeaders(raw));
    expect(second.status).toBe(202);
    expect(await second.json()).toEqual({ status: 'duplicate', event_id: eventId });

    const rows = await prisma.syncEventLog.findMany({ where: { eventId } });
    expect(rows).toHaveLength(1);
  });

  it('returns 4xx when the envelope shape is invalid', async () => {
    const raw = JSON.stringify({ event_id: 'not-a-uuid', payload: {} });
    const headers = signedHeaders(raw);
    const res = await postIngest(raw, headers);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless unsubscribe token: `<payloadB64>.<sigB64>` where payload
 * is `tenantId:emailHash:issuedAt`. Signed with HMAC-SHA256 using the
 * existing ENCRYPTION_MASTER_KEY (32-byte hex). No DB row required —
 * the email hash + tenant id is enough to drop a suppression entry on
 * click.
 *
 * Why HMAC and not just an opaque DB id: keeps the unsubscribe surface
 * stateless / no-write at email-build time. The flow that needs to
 * persist anything (the click) writes once.
 */
export interface UnsubscribePayload {
  tenantId: string;
  emailHash: string;
  /** Unix epoch seconds when the token was minted. */
  issuedAt: number;
}

export function buildUnsubscribeToken(
  args: { tenantId: string; emailHash: string },
  masterKeyHex: string,
): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${args.tenantId}:${args.emailHash}:${issuedAt.toString()}`;
  const sig = createHmac('sha256', Buffer.from(masterKeyHex, 'hex'))
    .update(payload)
    .digest('base64url');
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${sig}`;
}

export function verifyUnsubscribeToken(
  token: string,
  masterKeyHex: string,
): UnsubscribePayload | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const expected = createHmac('sha256', Buffer.from(masterKeyHex, 'hex'))
    .update(payload)
    .digest('base64url');

  // timingSafeEqual rejects buffers of different length — pad / cast.
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  const parts = payload.split(':');
  if (parts.length !== 3) return null;
  const [tenantId, emailHash, issuedAtStr] = parts as [string, string, string];
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;

  // sha256 hex is exactly 64 lowercase chars.
  if (!/^[0-9a-f]{64}$/.test(emailHash)) return null;
  if (!/^[0-9a-f-]{36}$/.test(tenantId)) return null;

  return { tenantId, emailHash, issuedAt };
}

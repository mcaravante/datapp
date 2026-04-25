import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Compute the canonical signature for a webhook: hex-encoded HMAC-SHA256
 * over `${timestamp}.${rawBody}`. The timestamp prefix prevents an
 * attacker from re-ordering captured payload+signature pairs.
 */
export function computeHmac(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

/**
 * Constant-time signature verification. Returns false (instead of
 * throwing) for any malformed input so callers can bucket it as 401.
 */
export function verifyHmac(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = computeHmac(secret, timestamp, rawBody);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature.toLowerCase(), 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Returns true if `timestamp` (unix epoch seconds, as a string) is within
 * `windowSeconds` of `now` (also unix epoch seconds). Future skew up to
 * the same window is tolerated to absorb minor clock drift.
 */
export function isTimestampFresh(timestamp: string, windowSeconds: number, now: number): boolean {
  if (!/^\d+$/.test(timestamp)) return false;
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(now - ts) <= windowSeconds;
}

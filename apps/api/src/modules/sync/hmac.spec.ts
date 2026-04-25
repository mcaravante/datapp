import { describe, expect, it } from 'vitest';
import { computeHmac, isTimestampFresh, verifyHmac } from './hmac';

describe('computeHmac', () => {
  it('is deterministic', () => {
    expect(computeHmac('s3cret', '1700000000', '{}')).toBe(
      computeHmac('s3cret', '1700000000', '{}'),
    );
  });

  it('changes with secret, timestamp, or body', () => {
    const a = computeHmac('s1', '1', 'x');
    expect(computeHmac('s2', '1', 'x')).not.toBe(a);
    expect(computeHmac('s1', '2', 'x')).not.toBe(a);
    expect(computeHmac('s1', '1', 'y')).not.toBe(a);
  });
});

describe('verifyHmac', () => {
  const secret = 'my-secret';
  const timestamp = '1700000000';
  const body = '{"event_type":"customer.created"}';

  it('accepts a correct signature', () => {
    const sig = computeHmac(secret, timestamp, body);
    expect(verifyHmac(secret, timestamp, body, sig)).toBe(true);
  });

  it('accepts upper-case hex signatures', () => {
    const sig = computeHmac(secret, timestamp, body).toUpperCase();
    expect(verifyHmac(secret, timestamp, body, sig)).toBe(true);
  });

  it('rejects when the body has been tampered', () => {
    const sig = computeHmac(secret, timestamp, body);
    expect(verifyHmac(secret, timestamp, `${body} `, sig)).toBe(false);
  });

  it('rejects when the secret differs', () => {
    const sig = computeHmac(secret, timestamp, body);
    expect(verifyHmac('other', timestamp, body, sig)).toBe(false);
  });

  it('rejects malformed signatures', () => {
    expect(verifyHmac(secret, timestamp, body, '')).toBe(false);
    expect(verifyHmac(secret, timestamp, body, 'not-hex')).toBe(false);
    expect(verifyHmac(secret, timestamp, body, '00'.repeat(31))).toBe(false); // too short
  });
});

describe('isTimestampFresh', () => {
  const now = 1_700_000_000;

  it('accepts a recent timestamp', () => {
    expect(isTimestampFresh(String(now - 60), 300, now)).toBe(true);
  });

  it('rejects a stale timestamp', () => {
    expect(isTimestampFresh(String(now - 600), 300, now)).toBe(false);
  });

  it('rejects a far-future timestamp (clock skew bound)', () => {
    expect(isTimestampFresh(String(now + 600), 300, now)).toBe(false);
  });

  it('rejects non-numeric timestamps', () => {
    expect(isTimestampFresh('abc', 300, now)).toBe(false);
    expect(isTimestampFresh('', 300, now)).toBe(false);
  });
});

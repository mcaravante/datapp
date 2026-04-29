import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { AuditService } from '../audit/audit.service';
import { AUTH_REDIS } from './auth.tokens';

/**
 * Two-layer throttle on `/v1/auth/login`:
 *
 *  - **Per-IP rate-limit** — every attempt (success or failure) increments
 *    a 60-second window. Above {@link IP_LIMIT}, return 429 immediately.
 *    Stops a single attacker from outpacing the password verifier.
 *
 *  - **Per-email progressive lockout** — failures (wrong password /
 *    wrong TOTP / wrong recovery code) increment a long-lived per-email
 *    counter. The lock duration escalates with the failure count, on
 *    the assumption that legitimate users rarely cross the next tier:
 *      - <5  fails → no lock
 *      - 5–9 fails → 1 minute lock
 *      - 10–19 fails → 15 minute lock
 *      - ≥20 fails → 1 hour lock (manual unlock or wait for the
 *        counter window to expire)
 *    Successful login wipes the counter and the lock.
 */
const IP_LIMIT = 5;
const IP_TTL_S = 60;
/** Failure counter window. Long enough that a slow drip still trips a tier. */
const EMAIL_FAIL_WINDOW_S = 60 * 60;

interface LockTier {
  threshold: number;
  ttlSeconds: number;
  label: string;
}

/** Ordered most-strict-first so we pick the highest-applicable tier. */
const LOCK_TIERS: readonly LockTier[] = [
  { threshold: 20, ttlSeconds: 60 * 60, label: '1h' },
  { threshold: 10, ttlSeconds: 15 * 60, label: '15m' },
  { threshold: 5, ttlSeconds: 60, label: '1m' },
];

@Injectable()
export class LoginThrottlerService {
  private readonly logger = new Logger(LoginThrottlerService.name);

  constructor(
    @Inject(AUTH_REDIS) private readonly redis: Redis,
    private readonly audit: AuditService,
  ) {}

  /**
   * Call before validating credentials. Increments the per-IP counter
   * and rejects if either the IP bucket is full or the target email is
   * currently locked.
   */
  async assertNotThrottled(ip: string | null, email: string): Promise<void> {
    if (ip) {
      const key = `login:ip:${ip}`;
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, IP_TTL_S);
      if (count > IP_LIMIT) {
        throw new HttpException(
          {
            error: 'rate_limited',
            message: 'Too many login attempts from this IP. Try again in a minute.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const lockKey = `login:lock:${normalize(email)}`;
    const locked = await this.redis.get(lockKey);
    if (locked) {
      throw new HttpException(
        {
          error: 'account_locked',
          message: 'Too many failed attempts. Account temporarily locked.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Call when credentials were rejected. Increments the per-email
   * failure counter and, when the count crosses a tier threshold,
   * applies the matching lock TTL. The counter is intentionally NOT
   * reset on lock so subsequent failures escalate to the next tier.
   *
   * `subject` is optional metadata used to enrich the audit row when
   * the lockout fires — pass it whenever the email resolves to a real
   * user. Anonymous attempts still throttle but don't generate a row.
   */
  async recordFailure(
    email: string,
    subject?: { userId: string; tenantId: string | null; ip?: string | null },
  ): Promise<void> {
    const e = normalize(email);
    const failKey = `login:fail:${e}`;
    const fails = await this.redis.incr(failKey);
    // Refresh the window each failure — slow brute-forcers still escalate.
    await this.redis.expire(failKey, EMAIL_FAIL_WINDOW_S);

    const tier = LOCK_TIERS.find((t) => fails >= t.threshold);
    if (!tier) return;

    const lockKey = `login:lock:${e}`;
    await this.redis.set(lockKey, tier.label, 'EX', tier.ttlSeconds);
    this.logger.warn(
      `Account locked (${tier.label}) after ${fails.toString()} failed attempts: ${shortHash(e)}`,
    );

    // Audit only when the count first crosses the tier threshold — every
    // subsequent failure inside the same tier just refreshes the lock,
    // so we don't want to emit an audit row for each one.
    if (subject && tier.threshold === fails) {
      await this.audit.log({
        tenantId: subject.tenantId,
        userId: subject.userId,
        action: 'account_locked',
        entity: 'auth.lockout',
        entityId: subject.userId,
        ip: subject.ip ?? null,
        after: { failures: fails, tier: tier.label, ttl_seconds: tier.ttlSeconds },
      });
    }
  }

  /** Successful login wipes both counters for the email. */
  async recordSuccess(email: string): Promise<void> {
    const e = normalize(email);
    await this.redis.del(`login:fail:${e}`, `login:lock:${e}`);
  }
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return `0x${(h >>> 0).toString(16)}`;
}

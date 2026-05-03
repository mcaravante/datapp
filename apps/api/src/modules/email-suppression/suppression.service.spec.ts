import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { EmailSuppressionService } from './suppression.service';
import type { PrismaService } from '../../db/prisma.service';

/**
 * Build a stub `PrismaService` whose only methods we exercise are
 * `emailSuppression.findUnique`, `customerProfile.findFirst`, and
 * `emailSend.count`. Casting via `unknown` keeps the rest of the
 * PrismaClient surface invisible to tests.
 */
function makeStubPrisma(overrides: {
  suppression?: unknown;
  profile?: { subscriptionStatus: string } | null;
  recentCount?: number;
}) {
  return {
    emailSuppression: {
      findUnique: vi.fn().mockResolvedValue(overrides.suppression ?? null),
    },
    customerProfile: {
      findFirst: vi.fn().mockResolvedValue(overrides.profile ?? null),
    },
    emailSend: {
      count: vi.fn().mockResolvedValue(overrides.recentCount ?? 0),
    },
  } as unknown as PrismaService;
}

function makeConfig(env: Record<string, unknown>) {
  return {
    get: (key: string) => env[key],
  } as unknown as ConfigService<Record<string, unknown>, true>;
}

const TENANT = '01234567-89ab-cdef-0123-456789abcdef';
const ALLOWED = 'matias.caravante@gmail.com';
const NOT_ALLOWED = 'someone.else@example.com';

describe('EmailSuppressionService.shouldSend', () => {
  describe('test-allowlist hard-lock (EMAIL_DRY_RUN)', () => {
    it('blocks sends to non-allowlisted addresses when dry-run is on', async () => {
      const prisma = makeStubPrisma({});
      const config = makeConfig({
        EMAIL_DRY_RUN: true,
        EMAIL_TEST_RECIPIENT_ALLOWLIST: [ALLOWED],
        EMAIL_FREQUENCY_CAP_24H: 3,
      });
      const sut = new EmailSuppressionService(prisma, config);

      const result = await sut.shouldSend({ tenantId: TENANT, email: NOT_ALLOWED });

      expect(result).toEqual({
        allow: false,
        reason: 'test_allowlist',
        message: expect.stringContaining('EMAIL_DRY_RUN'),
      });
      // The DB must NOT have been queried — fast-fail.
      expect(prisma.emailSuppression.findUnique).not.toHaveBeenCalled();
    });

    it('allows sends to allowlisted addresses when dry-run is on', async () => {
      const prisma = makeStubPrisma({});
      const config = makeConfig({
        EMAIL_DRY_RUN: true,
        EMAIL_TEST_RECIPIENT_ALLOWLIST: [ALLOWED],
        EMAIL_FREQUENCY_CAP_24H: 3,
      });
      const sut = new EmailSuppressionService(prisma, config);

      const result = await sut.shouldSend({ tenantId: TENANT, email: ALLOWED });

      expect(result.allow).toBe(true);
    });

    it('case-insensitive match against the allowlist', async () => {
      const prisma = makeStubPrisma({});
      const config = makeConfig({
        EMAIL_DRY_RUN: true,
        EMAIL_TEST_RECIPIENT_ALLOWLIST: [ALLOWED],
        EMAIL_FREQUENCY_CAP_24H: 3,
      });
      const sut = new EmailSuppressionService(prisma, config);

      const result = await sut.shouldSend({
        tenantId: TENANT,
        email: '  Matias.Caravante@GMAIL.com  ',
      });

      expect(result.allow).toBe(true);
    });

    it('with dry-run off, address allowlist no longer applies', async () => {
      const prisma = makeStubPrisma({});
      const config = makeConfig({
        EMAIL_DRY_RUN: false,
        EMAIL_TEST_RECIPIENT_ALLOWLIST: [ALLOWED],
        EMAIL_FREQUENCY_CAP_24H: 3,
      });
      const sut = new EmailSuppressionService(prisma, config);

      const result = await sut.shouldSend({ tenantId: TENANT, email: NOT_ALLOWED });

      expect(result.allow).toBe(true);
    });
  });

  describe('explicit suppression rows', () => {
    it('blocks if EmailSuppression row exists, mapping the reason through', async () => {
      const prisma = makeStubPrisma({
        suppression: { reason: 'hard_bounce', source: 'resend.bounced' },
      });
      const config = makeConfig({
        EMAIL_DRY_RUN: false,
        EMAIL_TEST_RECIPIENT_ALLOWLIST: [],
        EMAIL_FREQUENCY_CAP_24H: 3,
      });
      const sut = new EmailSuppressionService(prisma, config);

      const result = await sut.shouldSend({ tenantId: TENANT, email: 'bounced@example.com' });

      expect(result).toMatchObject({ allow: false, reason: 'hard_bounce' });
    });
  });

  describe('customer profile subscription status', () => {
    it.each([
      ['unsubscribed', 'unsubscribed'],
      ['complained', 'spam_complaint'],
      ['bounced', 'hard_bounce'],
    ] as const)(
      'blocks when customer subscriptionStatus = %s (mapped reason: %s)',
      async (status, expectedReason) => {
        const prisma = makeStubPrisma({ profile: { subscriptionStatus: status } });
        const config = makeConfig({
          EMAIL_DRY_RUN: false,
          EMAIL_TEST_RECIPIENT_ALLOWLIST: [],
          EMAIL_FREQUENCY_CAP_24H: 3,
        });
        const sut = new EmailSuppressionService(prisma, config);

        const result = await sut.shouldSend({ tenantId: TENANT, email: 'foo@bar.com' });

        expect(result).toMatchObject({ allow: false, reason: expectedReason });
      },
    );

    it('allows when customer subscriptionStatus = subscribed', async () => {
      const prisma = makeStubPrisma({ profile: { subscriptionStatus: 'subscribed' } });
      const config = makeConfig({
        EMAIL_DRY_RUN: false,
        EMAIL_TEST_RECIPIENT_ALLOWLIST: [],
        EMAIL_FREQUENCY_CAP_24H: 3,
      });
      const sut = new EmailSuppressionService(prisma, config);

      const result = await sut.shouldSend({ tenantId: TENANT, email: 'foo@bar.com' });

      expect(result.allow).toBe(true);
    });

    it('allows when no profile exists (guest)', async () => {
      const prisma = makeStubPrisma({ profile: null });
      const config = makeConfig({
        EMAIL_DRY_RUN: false,
        EMAIL_TEST_RECIPIENT_ALLOWLIST: [],
        EMAIL_FREQUENCY_CAP_24H: 3,
      });
      const sut = new EmailSuppressionService(prisma, config);

      const result = await sut.shouldSend({ tenantId: TENANT, email: 'guest@example.com' });

      expect(result.allow).toBe(true);
    });
  });

  describe('frequency cap', () => {
    it('blocks when 24h send count is at or above the cap', async () => {
      const prisma = makeStubPrisma({ recentCount: 3 });
      const config = makeConfig({
        EMAIL_DRY_RUN: false,
        EMAIL_TEST_RECIPIENT_ALLOWLIST: [],
        EMAIL_FREQUENCY_CAP_24H: 3,
      });
      const sut = new EmailSuppressionService(prisma, config);

      const result = await sut.shouldSend({ tenantId: TENANT, email: 'foo@bar.com' });

      expect(result).toMatchObject({ allow: false, reason: 'manual' });
      expect((result as { message: string }).message).toMatch(/frequency cap/i);
    });

    it('allows when count is below the cap', async () => {
      const prisma = makeStubPrisma({ recentCount: 2 });
      const config = makeConfig({
        EMAIL_DRY_RUN: false,
        EMAIL_TEST_RECIPIENT_ALLOWLIST: [],
        EMAIL_FREQUENCY_CAP_24H: 3,
      });
      const sut = new EmailSuppressionService(prisma, config);

      const result = await sut.shouldSend({ tenantId: TENANT, email: 'foo@bar.com' });

      expect(result.allow).toBe(true);
    });

    it('cap=0 disables the check entirely', async () => {
      const prisma = makeStubPrisma({ recentCount: 999 });
      const config = makeConfig({
        EMAIL_DRY_RUN: false,
        EMAIL_TEST_RECIPIENT_ALLOWLIST: [],
        EMAIL_FREQUENCY_CAP_24H: 0,
      });
      const sut = new EmailSuppressionService(prisma, config);

      const result = await sut.shouldSend({ tenantId: TENANT, email: 'foo@bar.com' });

      expect(result.allow).toBe(true);
      expect(prisma.emailSend.count).not.toHaveBeenCalled();
    });
  });

  describe('hashing', () => {
    it('hashEmail trims and lowercases before sha256', () => {
      const a = EmailSuppressionService.hashEmail('Foo@Bar.com');
      const b = EmailSuppressionService.hashEmail('  foo@bar.com  ');
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});

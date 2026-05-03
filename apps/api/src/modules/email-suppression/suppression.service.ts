import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../db/prisma.service';
import type { Env } from '../../config/env';
import type { SuppressionReason } from '@datapp/db';

/**
 * The single decision authority for "should we send this email right now?"
 *
 * Every dispatch path — recovery scheduler, manual admin send, CLI E2E —
 * MUST call `shouldSend` before handing anything to Resend. The order of
 * checks is intentional and fail-closed: any single block stops the send.
 *
 *   1. EMAIL_DRY_RUN + recipient not in EMAIL_TEST_RECIPIENT_ALLOWLIST
 *   2. EmailSuppression row exists for the recipient (bounce/complaint/manual)
 *   3. CustomerProfile.subscriptionStatus is `unsubscribed | complained | bounced`
 *   4. Frequency cap exceeded in the last 24h
 *
 * Returns a discriminated result so callers can persist the reason on
 * `EmailSend.errorMessage` and surface it in the admin UI.
 */
export interface SuppressionAllow {
  allow: true;
}

export interface SuppressionBlock {
  allow: false;
  reason: SuppressionReason;
  message: string;
}

export type SuppressionDecision = SuppressionAllow | SuppressionBlock;

@Injectable()
export class EmailSuppressionService {
  private readonly logger = new Logger(EmailSuppressionService.name);
  private readonly dryRun: boolean;
  private readonly allowlist: ReadonlySet<string>;
  private readonly frequencyCap: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.dryRun = config.get('EMAIL_DRY_RUN', { infer: true });
    const list = config.get('EMAIL_TEST_RECIPIENT_ALLOWLIST', { infer: true });
    this.allowlist = new Set(list);
    this.frequencyCap = config.get('EMAIL_FREQUENCY_CAP_24H', { infer: true });
  }

  /** sha256 hex of the lower-cased trimmed email — matches the schema. */
  static hashEmail(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }

  async shouldSend(args: {
    tenantId: string;
    email: string;
  }): Promise<SuppressionDecision> {
    const email = args.email.trim().toLowerCase();
    const emailHash = EmailSuppressionService.hashEmail(email);

    // 1. Test allowlist hard-lock. THIS IS THE ABSOLUTE FIRST CHECK.
    //    Even if every other guard is broken, dev/staging cannot leak
    //    real customer mail.
    if (this.dryRun && !this.allowlist.has(email)) {
      return {
        allow: false,
        reason: 'test_allowlist',
        message: 'EMAIL_DRY_RUN is on and recipient is not in EMAIL_TEST_RECIPIENT_ALLOWLIST',
      };
    }

    // 2. Explicit suppression entry (bounce / complaint / manual / unsubscribe).
    const suppression = await this.prisma.emailSuppression.findUnique({
      where: { tenantId_emailHash: { tenantId: args.tenantId, emailHash } },
    });
    if (suppression) {
      return {
        allow: false,
        reason: suppression.reason,
        message: `Address suppressed (${suppression.reason}${suppression.source ? `, ${suppression.source}` : ''})`,
      };
    }

    // 3. Customer profile subscription status. We look up by email hash
    //    so the check works for guests too (they may have a profile from
    //    earlier signup that they later unsubscribed from).
    const profile = await this.prisma.customerProfile.findFirst({
      where: { tenantId: args.tenantId, emailHash },
      select: { subscriptionStatus: true },
    });
    if (profile) {
      const reason = this.subscriptionStatusToReason(profile.subscriptionStatus);
      if (reason) {
        return {
          allow: false,
          reason,
          message: `Customer profile subscription status is ${profile.subscriptionStatus}`,
        };
      }
    }

    // 4. Frequency cap. Counts queued/delivered/bounced sends in the last
    //    24h to the same address. `failed`, `suppressed`, and `cancelled`
    //    do not count against the cap.
    if (this.frequencyCap > 0) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentCount = await this.prisma.emailSend.count({
        where: {
          tenantId: args.tenantId,
          toEmailHash: emailHash,
          status: { in: ['queued', 'delivered', 'bounced', 'complained'] },
          createdAt: { gte: since },
        },
      });
      if (recentCount >= this.frequencyCap) {
        return {
          allow: false,
          reason: 'manual',
          message: `Frequency cap reached (${recentCount.toString()} in last 24h, limit ${this.frequencyCap.toString()})`,
        };
      }
    }

    return { allow: true };
  }

  private subscriptionStatusToReason(status: string): SuppressionReason | null {
    switch (status) {
      case 'unsubscribed':
        return 'unsubscribed';
      case 'complained':
        return 'spam_complaint';
      case 'bounced':
        return 'hard_bounce';
      default:
        return null;
    }
  }
}

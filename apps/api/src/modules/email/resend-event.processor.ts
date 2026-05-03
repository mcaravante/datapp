import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { EmailEventType, EmailSendStatus, SuppressionReason } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import { EmailSuppressionService } from '../email-suppression/suppression.service';
import { QUEUES } from '../queue/queue.constants';

interface ResendEventJobData {
  /** svix-id header — natural idempotency key for the providerEventId column. */
  svixId: string;
  payload: {
    type: string;
    created_at: string;
    data: {
      email_id?: string;
      headers?: { name: string; value: string }[];
      [key: string]: unknown;
    };
  };
}

/**
 * Map Resend webhook event names → our EmailEventType enum values.
 * See: https://resend.com/docs/dashboard/webhooks/event-types
 */
const RESEND_EVENT_MAP: Record<string, EmailEventType> = {
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.failed': 'failed',
  'email.unsubscribed': 'unsubscribed',
};

/**
 * Map Resend event types to a target EmailSend status. Only terminal
 * status changes — `opened`/`clicked`/`delivery_delayed` are persisted
 * as events but don't move the send status itself.
 */
const STATUS_MAP: Partial<Record<EmailEventType, EmailSendStatus>> = {
  delivered: 'delivered',
  bounced: 'bounced',
  complained: 'complained',
  failed: 'failed',
};

/**
 * Bounces and complaints auto-populate the suppression list. The
 * mapping mirrors the SuppressionReason enum.
 */
const SUPPRESSION_MAP: Partial<Record<EmailEventType, SuppressionReason>> = {
  bounced: 'hard_bounce',
  complained: 'spam_complaint',
  unsubscribed: 'unsubscribed',
};

@Processor(QUEUES.emailEventsResend, { concurrency: 4 })
@Injectable()
export class ResendEventProcessor extends WorkerHost {
  private readonly logger = new Logger(ResendEventProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ResendEventJobData>): Promise<{ skipped?: boolean; persisted?: boolean }> {
    const { svixId, payload } = job.data;

    const eventType = RESEND_EVENT_MAP[payload.type];
    if (!eventType) {
      this.logger.debug(`Unknown Resend event type: ${payload.type} (svix-id ${svixId})`);
      return { skipped: true };
    }

    // Locate the EmailSend row. First try by Resend message id (set when
    // the dispatcher persisted the ack); fallback to X-Entity-Ref-ID
    // header (= idempotencyKey) for events that arrive before the
    // dispatcher had a chance to persist the message id.
    const messageId = payload.data.email_id;
    const refHeader =
      payload.data.headers?.find((h) => h.name.toLowerCase() === 'x-entity-ref-id')?.value ?? null;

    const send = messageId
      ? await this.prisma.emailSend.findFirst({
          where: { resendMessageId: messageId },
          select: { id: true, tenantId: true, toEmail: true, status: true, lastEventAt: true },
        })
      : refHeader
        ? await this.prisma.emailSend.findFirst({
            where: { idempotencyKey: refHeader },
            select: { id: true, tenantId: true, toEmail: true, status: true, lastEventAt: true },
          })
        : null;

    if (!send) {
      this.logger.warn(
        `Resend event ${payload.type} (svix-id ${svixId}) had no matching EmailSend (messageId=${messageId ?? 'n/a'}, ref=${refHeader ?? 'n/a'})`,
      );
      return { skipped: true };
    }

    const occurredAt = new Date(payload.created_at);

    // Idempotent insert — `(tenantId, providerEventId)` unique constraint
    // is the second-line guard against replay.
    try {
      await this.prisma.emailEvent.create({
        data: {
          tenantId: send.tenantId,
          emailSendId: send.id,
          providerEventId: svixId,
          eventType,
          occurredAt,
          payload: payload as object,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        this.logger.debug(`Idempotent skip: ${svixId} already persisted`);
        return { skipped: true };
      }
      throw err;
    }

    // Update EmailSend status if this event represents a state change.
    // Late-arriving events only advance lastEventAt forward.
    const targetStatus = STATUS_MAP[eventType];
    const updates: { lastEventType: EmailEventType; lastEventAt: Date; status?: EmailSendStatus } = {
      lastEventType: eventType,
      lastEventAt: occurredAt,
    };

    const isNewer = !send.lastEventAt || occurredAt.getTime() > send.lastEventAt.getTime();
    if (targetStatus && isNewer) {
      updates.status = targetStatus;
    }

    await this.prisma.emailSend.update({
      where: { id: send.id },
      data: updates,
    });

    // Auto-populate suppression list for bounce/complaint/unsubscribe.
    const suppressionReason = SUPPRESSION_MAP[eventType];
    if (suppressionReason) {
      const emailHash = EmailSuppressionService.hashEmail(send.toEmail);
      await this.prisma.emailSuppression.upsert({
        where: { tenantId_emailHash: { tenantId: send.tenantId, emailHash } },
        create: {
          tenantId: send.tenantId,
          email: send.toEmail.toLowerCase(),
          emailHash,
          reason: suppressionReason,
          source: `resend.${eventType}`,
          notes: `Auto-added from Resend webhook ${svixId}`,
        },
        update: {
          // Existing entries stay as-is; we don't overwrite the original
          // reason/source even if a later event would be different.
        },
      });
    }

    return { persisted: true };
  }
}

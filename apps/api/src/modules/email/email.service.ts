import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../db/prisma.service';
import { TemplateRendererService, TemplateRenderError } from './template-renderer.service';
import { ResendClient, ResendDeliveryError } from './resend.client';
import { EmailSuppressionService } from '../email-suppression/suppression.service';
import type { Env } from '../../config/env';

/**
 * The single entry point for actually delivering an `EmailSend` row.
 *
 * `dispatchSend(emailSendId)` does, in order:
 *   1. Load the row + its stage + its template. Bail if not in `pending`.
 *   2. Re-run the suppression check (state may have changed since enqueue).
 *      A blocked send transitions the row to `suppressed` with reason on
 *      `errorMessage`.
 *   3. Render the template with the row's `renderContext` snapshot.
 *   4. Hand to Resend. On ack, persist `resendMessageId` and transition to
 *      `queued`. On permanent error transition to `failed`. Transient
 *      errors bubble so BullMQ can retry.
 *
 * Idempotency: the unique constraint `(tenantId, idempotencyKey)` on
 * `EmailSend` plus the BullMQ jobId pattern prevents the row from being
 * created twice. This service re-checks `status === 'pending'` so a
 * duplicate dispatch is a no-op.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly defaultFrom: string;
  private readonly defaultReplyTo: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: TemplateRendererService,
    private readonly resend: ResendClient,
    private readonly suppression: EmailSuppressionService,
    config: ConfigService<Env, true>,
  ) {
    this.defaultFrom = config.get('RESEND_FROM_EMAIL', { infer: true });
    this.defaultReplyTo = config.get('RESEND_REPLY_TO', { infer: true });
  }

  async dispatchSend(emailSendId: string): Promise<void> {
    const send = await this.prisma.emailSend.findUnique({
      where: { id: emailSendId },
      include: {
        stage: { include: { template: true } },
        campaign: { select: { fromEmail: true, replyToEmail: true } },
      },
    });
    if (!send) {
      throw new NotFoundException(`EmailSend ${emailSendId} not found`);
    }

    // Re-entrancy guard. A duplicate dispatch (BullMQ retry, manual
    // retry, etc.) is a no-op.
    if (send.status !== 'pending') {
      this.logger.debug(
        `EmailSend ${emailSendId} already in status=${send.status} — skipping dispatch`,
      );
      return;
    }

    // Re-run suppression. The row may have been queued days ago and the
    // address might have bounced or unsubscribed since.
    const decision = await this.suppression.shouldSend({
      tenantId: send.tenantId,
      email: send.toEmail,
    });
    if (!decision.allow) {
      await this.prisma.emailSend.update({
        where: { id: emailSendId },
        data: {
          status: 'suppressed',
          errorMessage: decision.message,
        },
      });
      this.logger.log(
        `EmailSend ${emailSendId} suppressed: ${decision.reason} — ${decision.message}`,
      );
      return;
    }

    // Render. A render error is permanent — operator-authored template
    // bug, fix the template, manually reset the row.
    let rendered: { subject: string; html: string; text?: string };
    try {
      rendered = await this.renderer.render(
        send.stage.template,
        send.renderContext as Record<string, unknown>,
      );
    } catch (err) {
      const message = (err as Error).message;
      await this.prisma.emailSend.update({
        where: { id: emailSendId },
        data: { status: 'failed', errorMessage: `Render: ${message}` },
      });
      this.logger.error(`EmailSend ${emailSendId} render failed: ${message}`);
      // Don't rethrow — transitioning to `failed` already records the
      // outcome; rethrowing would cause BullMQ to retry an irrecoverable
      // error.
      if (err instanceof TemplateRenderError) return;
      throw err;
    }

    // Hand to Resend. Permanent errors → `failed`; transient → rethrow
    // so BullMQ retries.
    const fromEmail = send.fromEmail || send.campaign.fromEmail || this.defaultFrom;
    const replyTo = send.campaign.replyToEmail || this.defaultReplyTo;

    try {
      const result = await this.resend.send({
        from: fromEmail,
        to: send.toEmail,
        ...(replyTo ? { replyTo } : {}),
        subject: rendered.subject,
        html: rendered.html,
        ...(rendered.text ? { text: rendered.text } : {}),
        idempotencyKey: send.idempotencyKey,
        tags: [
          { name: 'tenant_id', value: send.tenantId },
          { name: 'campaign_id', value: send.campaignId },
          { name: 'stage_id', value: send.stageId },
          { name: 'send_id', value: send.id },
        ],
      });

      await this.prisma.emailSend.update({
        where: { id: emailSendId },
        data: {
          status: 'queued',
          resendMessageId: result.messageId,
          sentAt: new Date(),
          subject: rendered.subject,
          fromEmail,
        },
      });
      this.logger.log(
        `EmailSend ${emailSendId} accepted by Resend (messageId=${result.messageId})`,
      );
    } catch (err) {
      if (err instanceof ResendDeliveryError && !err.retryable) {
        await this.prisma.emailSend.update({
          where: { id: emailSendId },
          data: { status: 'failed', errorMessage: err.message },
        });
        this.logger.error(`EmailSend ${emailSendId} permanently failed: ${err.message}`);
        return;
      }
      // Transient — let BullMQ retry. The row stays in `pending` so the
      // re-entrancy guard at the top still allows the next attempt.
      throw err;
    }
  }
}

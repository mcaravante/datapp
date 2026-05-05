import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../db/prisma.service';
import { TemplateRendererService, TemplateRenderError } from './template-renderer.service';
import { ResendClient, ResendDeliveryError } from './resend.client';
import { EmailSuppressionService } from '../email-suppression/suppression.service';
import { BrandingService } from '../branding/branding.service';
import { composeEmailShell } from '../branding/email-shell';
import { buildUnsubscribeToken } from '../branding/unsubscribe-token';
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
  private readonly publicApiUrl: string;
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: TemplateRendererService,
    private readonly resend: ResendClient,
    private readonly suppression: EmailSuppressionService,
    private readonly branding: BrandingService,
    config: ConfigService<Env, true>,
  ) {
    this.defaultFrom = config.get('RESEND_FROM_EMAIL', { infer: true });
    this.defaultReplyTo = config.get('RESEND_REPLY_TO', { infer: true });
    this.publicApiUrl = config.get('APP_URL_API', { infer: true }).replace(/\/+$/, '');
    this.encryptionKey = config.get('ENCRYPTION_MASTER_KEY', { infer: true });
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

    // Wrap the rendered body in the brand shell + unsubscribe footer.
    // The token bundles the recipient identity (tenant + email hash) so
    // the public unsubscribe endpoint can act statelessly.
    const branding = await this.branding.resolveForCompose(send.tenantId);
    const unsubscribeToken = buildUnsubscribeToken(
      { tenantId: send.tenantId, emailHash: send.toEmailHash },
      this.encryptionKey,
    );
    const unsubscribeUrl = `${this.publicApiUrl}/unsubscribe/${unsubscribeToken}`;
    const wrappedHtml = composeEmailShell({
      bodyHtml: rendered.html,
      branding,
      unsubscribeUrl,
    });

    try {
      const result = await this.resend.send({
        from: fromEmail,
        to: send.toEmail,
        ...(replyTo ? { replyTo } : {}),
        subject: rendered.subject,
        html: wrappedHtml,
        ...(rendered.text ? { text: `${rendered.text}\n\n---\nPara desuscribirte: ${unsubscribeUrl}` } : {}),
        idempotencyKey: send.idempotencyKey,
        unsubscribeUrl,
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

  /**
   * Render a template + brand shell with synthetic variables and ship a
   * single email straight to Resend. Used by the "Enviar prueba" button
   * on /templates/[id] and /campaigns/[id] so the operator can validate
   * a template against their inbox without waiting on the abandoned-cart
   * scheduler. Bypasses the `email_send` table on purpose — this is a
   * test send, not a campaign event, and its outcome lives in the Resend
   * dashboard.
   *
   * Goes through `EmailSuppressionService.shouldSend` so the dry-run
   * allowlist is still enforced; trying to test-send to an address
   * outside the allowlist returns a structured `suppressed` outcome
   * instead of leaking outside.
   */
  async sendTest(args: {
    tenantId: string;
    templateId: string;
    to: string;
    variables: Record<string, unknown>;
    fromEmailOverride?: string | null;
  }): Promise<
    | { status: 'sent'; messageId: string }
    | { status: 'suppressed'; reason: string; message: string }
    | { status: 'failed'; message: string }
  > {
    const trimmedTo = args.to.trim();
    if (trimmedTo.length === 0 || !trimmedTo.includes('@')) {
      throw new BadRequestException('`to` debe ser un email válido');
    }
    const lcTo = trimmedTo.toLowerCase();

    const template = await this.prisma.emailTemplate.findUnique({
      where: { id: args.templateId },
    });
    if (!template || template.tenantId !== args.tenantId) {
      throw new NotFoundException(`Template ${args.templateId} not found`);
    }

    const decision = await this.suppression.shouldSend({
      tenantId: args.tenantId,
      email: lcTo,
    });
    if (!decision.allow) {
      this.logger.log(
        `sendTest suppressed tenant=${args.tenantId} template=${args.templateId} to=${decision.reason}`,
      );
      return {
        status: 'suppressed',
        reason: decision.reason,
        message: decision.message,
      };
    }

    let rendered: { subject: string; html: string; text?: string };
    try {
      rendered = await this.renderer.render(template, args.variables);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(`sendTest render failed template=${args.templateId}: ${message}`);
      return { status: 'failed', message: `Render: ${message}` };
    }

    const branding = await this.branding.resolveForCompose(args.tenantId);
    const toEmailHash = createHash('sha256').update(lcTo).digest('hex');
    const unsubscribeToken = buildUnsubscribeToken(
      { tenantId: args.tenantId, emailHash: toEmailHash },
      this.encryptionKey,
    );
    const unsubscribeUrl = `${this.publicApiUrl}/unsubscribe/${unsubscribeToken}`;
    const wrappedHtml = composeEmailShell({
      bodyHtml: rendered.html,
      branding,
      unsubscribeUrl,
    });

    const fromEmail = args.fromEmailOverride || this.defaultFrom;
    const idempotencyKey = `test:${template.id}:${randomUUID()}`;

    try {
      const result = await this.resend.send({
        from: fromEmail,
        to: lcTo,
        ...(this.defaultReplyTo ? { replyTo: this.defaultReplyTo } : {}),
        subject: `[TEST] ${rendered.subject}`,
        html: wrappedHtml,
        ...(rendered.text
          ? { text: `[TEST]\n${rendered.text}\n\n---\nPara desuscribirte: ${unsubscribeUrl}` }
          : {}),
        idempotencyKey,
        unsubscribeUrl,
        tags: [
          { name: 'tenant_id', value: args.tenantId },
          { name: 'template_id', value: template.id },
          { name: 'send_kind', value: 'test' },
        ],
      });
      this.logger.log(
        `sendTest delivered tenant=${args.tenantId} template=${template.slug} messageId=${result.messageId}`,
      );
      return { status: 'sent', messageId: result.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`sendTest failed template=${template.slug}: ${message}`);
      return { status: 'failed', message };
    }
  }
}

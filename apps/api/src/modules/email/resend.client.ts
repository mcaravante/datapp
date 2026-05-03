import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import pRetry, { AbortError, type FailedAttemptError } from 'p-retry';
import type { Env } from '../../config/env';

export class ResendDeliveryError extends Error {
  override readonly name = 'ResendDeliveryError';
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.retryable = retryable;
  }
}

export interface ResendSendInput {
  /** RFC-5322 from address. Must be a verified Resend sender. */
  from: string;
  /** Plain string or "Name <addr>". */
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  /**
   * Idempotency key — copied verbatim into the `X-Entity-Ref-ID` header
   * Resend echoes back on every webhook event for the message. The
   * webhook processor falls back to this header when `resendMessageId`
   * is not yet persisted at event-arrival time.
   */
  idempotencyKey: string;
  /**
   * Public unsubscribe URL. When set, populates RFC 8058's
   * `List-Unsubscribe` + `List-Unsubscribe-Post` headers so Gmail /
   * Outlook show their native one-click unsubscribe button at the top
   * of the inbox view.
   */
  unsubscribeUrl?: string;
  /**
   * Tags for Resend dashboard filtering: tenant, campaign, stage, send.
   * Resend allows up to 10 tags, name+value ≤ 256 chars each.
   */
  tags?: { name: string; value: string }[];
}

export interface ResendSendResult {
  messageId: string;
}

/**
 * Thin wrapper around the Resend SDK with `p-retry` for transient errors.
 *
 * Error classification:
 *   - 429 / 5xx / network → retryable. p-retry handles backoff.
 *   - 400 (validation, unverified domain, etc.) → permanent. Fail-fast.
 *   - 401 / 403 → permanent. Indicates misconfigured key — surface loud.
 */
@Injectable()
export class ResendClient {
  private readonly logger = new Logger(ResendClient.name);
  private readonly client: Resend | null;
  private readonly enabled: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.enabled = config.get('EMAIL_ENGINE_ENABLED', { infer: true });
    const apiKey = config.get('RESEND_API_KEY', { infer: true });
    this.client =
      this.enabled && apiKey && apiKey.length > 0
        ? new Resend(apiKey)
        : null;

    if (this.enabled && !this.client) {
      this.logger.warn(
        'EMAIL_ENGINE_ENABLED=true but RESEND_API_KEY is empty — sends will fail until the key is set',
      );
    }
  }

  async send(input: ResendSendInput): Promise<ResendSendResult> {
    if (!this.client) {
      throw new ResendDeliveryError(
        'Resend client is not initialized (EMAIL_ENGINE_ENABLED=false or RESEND_API_KEY missing)',
        false,
      );
    }

    const headers: Record<string, string> = {
      'X-Entity-Ref-ID': input.idempotencyKey,
    };
    if (input.unsubscribeUrl) {
      headers['List-Unsubscribe'] = `<${input.unsubscribeUrl}>`;
      // RFC 8058: signals that the URL above accepts a one-click POST
      // from Gmail / Apple Mail / Outlook for native unsubscribe UI.
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    return await pRetry(
      async () => {
        const { data, error } = await this.client!.emails.send({
          from: input.from,
          to: input.to,
          ...(input.replyTo ? { replyTo: input.replyTo } : {}),
          subject: input.subject,
          html: input.html,
          ...(input.text ? { text: input.text } : {}),
          headers,
          ...(input.tags && input.tags.length > 0 ? { tags: input.tags } : {}),
        });

        if (error) {
          // Resend SDK error shape — `name` carries the category.
          // See: https://resend.com/docs/api-reference/errors
          const status = (error as { statusCode?: number }).statusCode ?? 0;
          const retryable = status === 429 || status >= 500;
          const message = `Resend error (${error.name ?? 'unknown'}, status=${status.toString()}): ${error.message}`;
          if (retryable) {
            throw new ResendDeliveryError(message, true, error);
          }
          throw new AbortError(message);
        }

        if (!data?.id) {
          throw new AbortError('Resend returned no message id');
        }

        return { messageId: data.id };
      },
      {
        retries: 3,
        minTimeout: 500,
        maxTimeout: 5_000,
        factor: 2,
        onFailedAttempt: (e: FailedAttemptError) => {
          this.logger.warn(
            `Resend send attempt ${e.attemptNumber.toString()} failed (${e.retriesLeft.toString()} left): ${e.message}`,
          );
        },
      },
    );
  }
}

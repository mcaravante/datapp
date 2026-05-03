import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Throttle } from '@nestjs/throttler';
import { Webhook } from 'svix';
import type { Request } from 'express';
import type { Queue } from 'bullmq';
import type { Env } from '../../config/env';
import { QUEUES } from '../queue/queue.constants';

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    headers?: { name: string; value: string }[];
    /** Resend includes a snapshot of the original send fields; we only
     *  use `email_id` + the X-Entity-Ref-ID header for matching. */
    [key: string]: unknown;
  };
}

@Controller({ path: 'webhooks', version: '1' })
@ApiTags('webhooks:resend')
export class ResendWebhookController {
  private readonly logger = new Logger(ResendWebhookController.name);
  private readonly webhook: Webhook | null;

  constructor(
    config: ConfigService<Env, true>,
    @InjectQueue(QUEUES.emailEventsResend) private readonly queue: Queue,
  ) {
    const secret = config.get('RESEND_WEBHOOK_SECRET', { infer: true });
    this.webhook = secret && secret.length >= 16 ? new Webhook(secret) : null;
    if (!this.webhook) {
      this.logger.warn(
        'RESEND_WEBHOOK_SECRET is not set — /v1/webhooks/resend will reject every request',
      );
    }
  }

  @Post('resend')
  @HttpCode(HttpStatus.ACCEPTED)
  // Match the throttle of the magento ingest endpoint.
  @Throttle({ default: { ttl: 60_000, limit: 600 } })
  async handle(@Req() req: Request, @Body() body: unknown): Promise<{ status: string }> {
    if (!this.webhook) {
      throw new UnauthorizedException('Webhook secret not configured');
    }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body unavailable — express rawBody middleware missing');
    }

    const headers = {
      'svix-id': this.headerString(req.headers['svix-id']),
      'svix-timestamp': this.headerString(req.headers['svix-timestamp']),
      'svix-signature': this.headerString(req.headers['svix-signature']),
    };

    let verified: ResendWebhookPayload;
    try {
      verified = this.webhook.verify(rawBody.toString('utf8'), headers) as ResendWebhookPayload;
    } catch (err) {
      this.logger.warn(`Resend webhook signature verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const svixId = headers['svix-id'];
    if (!svixId) {
      throw new BadRequestException('Missing svix-id header');
    }

    // Use `body` (parsed JSON) for the queue payload — `verified` is the
    // same object Svix returns and is already validated.
    void body;

    await this.queue.add(
      'resend-event',
      { svixId, payload: verified },
      {
        jobId: svixId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 14 * 24 * 60 * 60 },
      },
    );

    return { status: 'accepted' };
  }

  private headerString(v: string | string[] | undefined): string {
    if (Array.isArray(v)) return v[0] ?? '';
    return v ?? '';
  }
}

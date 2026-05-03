import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailSuppressionModule } from '../email-suppression/email-suppression.module';
import { QUEUES } from '../queue/queue.constants';
import { EmailService } from './email.service';
import { EmailSendProcessor } from './email-send.processor';
import { TemplateRendererService } from './template-renderer.service';
import { ResendClient } from './resend.client';
import { ResendEventProcessor } from './resend-event.processor';
import { ResendWebhookController } from './resend-webhook.controller';

/**
 * Phase 3 — Resend client wrapper, MJML+Handlebars renderer, dispatcher,
 * BullMQ send-processor, webhook receiver + event-processor.
 */
@Module({
  imports: [
    EmailSuppressionModule,
    BullModule.registerQueue(
      { name: QUEUES.emailSend },
      { name: QUEUES.emailEventsResend },
    ),
  ],
  controllers: [ResendWebhookController],
  providers: [
    EmailService,
    EmailSendProcessor,
    TemplateRendererService,
    ResendClient,
    ResendEventProcessor,
  ],
  exports: [EmailService, TemplateRendererService, ResendClient],
})
export class EmailModule {}

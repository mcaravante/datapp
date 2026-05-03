import { Module } from '@nestjs/common';
import { EmailSuppressionModule } from '../email-suppression/email-suppression.module';
import { EmailService } from './email.service';
import { TemplateRendererService } from './template-renderer.service';
import { ResendClient } from './resend.client';

/**
 * Phase 3 — Resend client wrapper, MJML+Handlebars renderer, dispatcher.
 * Webhook controller + event processor land in a follow-up commit within
 * iteration 3.
 */
@Module({
  imports: [EmailSuppressionModule],
  providers: [EmailService, TemplateRendererService, ResendClient],
  exports: [EmailService, TemplateRendererService, ResendClient],
})
export class EmailModule {}

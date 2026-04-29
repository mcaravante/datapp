import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { Env } from '../../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Tiny mail abstraction. With SMTP_HOST configured we send via
 * nodemailer's SMTP transport (works with Resend / Mailgun / SES /
 * Gmail / etc.). Without it we log the message to stdout so the
 * password-reset flow stays exercisable in `pnpm dev` without
 * provisioning an SMTP relay.
 */
@Injectable()
export class MailerService implements OnApplicationShutdown {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    const host = config.get('SMTP_HOST', { infer: true });
    this.from = config.get('SMTP_FROM', { infer: true });

    if (!host || host.length === 0) {
      this.transporter = null;
      this.logger.warn('SMTP_HOST not configured — outbound mail will be logged, not sent');
      return;
    }

    const user = config.get('SMTP_USER', { infer: true });
    const password = config.get('SMTP_PASSWORD', { infer: true });

    this.transporter = nodemailer.createTransport({
      host,
      port: config.get('SMTP_PORT', { infer: true }),
      secure: config.get('SMTP_SECURE', { infer: true }),
      auth: user && password ? { user, pass: password } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        `[stdout-mailer] To=${message.to} Subject=${message.subject}\n${message.text}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
  }

  async onApplicationShutdown(): Promise<void> {
    this.transporter?.close();
  }
}

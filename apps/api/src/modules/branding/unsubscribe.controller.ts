import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { PrismaService } from '../../db/prisma.service';
import { EmailSuppressionService } from '../email-suppression/suppression.service';
import { BrandingService } from './branding.service';
import { verifyUnsubscribeToken } from './unsubscribe-token';
import type { Env } from '../../config/env';

/**
 * Public, unauthenticated unsubscribe surface.
 *
 *   GET  /unsubscribe/:token   → Confirmation page (HTML) + a form that
 *                                POSTs back to confirm.
 *   POST /unsubscribe/:token   → Records the EmailSuppression row,
 *                                shows a success page. Idempotent on
 *                                repeat submissions.
 *
 * The path is unversioned (`/unsubscribe/...`, no `/v1/`) so URLs
 * embedded in already-sent emails keep resolving forever, even across
 * API versions.
 *
 * Auto-POST is supported via RFC 8058's One-Click header — Gmail /
 * Apple Mail send a POST directly to the URL when the user clicks
 * their native "Unsubscribe" button.
 */
@Controller('unsubscribe')
@ApiTags('public:unsubscribe')
export class UnsubscribeController {
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly branding: BrandingService,
    config: ConfigService<Env, true>,
  ) {
    this.encryptionKey = config.get('ENCRYPTION_MASTER_KEY', { infer: true });
  }

  @Get(':token')
  async show(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const payload = verifyUnsubscribeToken(token, this.encryptionKey);
    if (!payload) {
      res.status(400).type('text/html').send(this.renderShell({
        title: 'Link inválido',
        body: '<p>Este link de desuscripción es inválido o fue manipulado. Si querés desuscribirte, respondé al email original o contactá al soporte.</p>',
      }));
      return;
    }

    // Already suppressed? Show the success state directly.
    const existing = await this.prisma.emailSuppression.findUnique({
      where: {
        tenantId_emailHash: { tenantId: payload.tenantId, emailHash: payload.emailHash },
      },
      select: { reason: true, createdAt: true },
    });
    if (existing && existing.reason === 'unsubscribed') {
      res.type('text/html').send(this.renderShell({
        title: 'Ya estás desuscripto',
        body: `<p>Esta dirección de email ya está dada de baja desde ${existing.createdAt.toLocaleDateString('es-AR')}. No vas a recibir más emails de marketing.</p>`,
        contactInfo: await this.branding.findContactInfo(payload.tenantId),
      }));
      return;
    }

    res.type('text/html').send(this.renderShell({
      title: 'Confirmar desuscripción',
      body: `
        <p>¿Querés dejar de recibir nuestros emails?</p>
        <form method="POST" action="/unsubscribe/${encodeURIComponent(token)}" style="margin-top: 16px;">
          <button type="submit" style="background: #111; color: #fff; border: 0; padding: 10px 20px; border-radius: 6px; font-size: 14px; cursor: pointer;">
            Sí, desuscribirme
          </button>
        </form>
        <p style="margin-top: 24px; font-size: 12px; color: #888;">
          Si llegaste acá por error, podés cerrar esta ventana y todo sigue como estaba.
        </p>
      `,
      contactInfo: await this.branding.findContactInfo(payload.tenantId),
    }));
  }

  @Post(':token')
  @HttpCode(HttpStatus.OK)
  async confirm(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const payload = verifyUnsubscribeToken(token, this.encryptionKey);
    if (!payload) {
      throw new BadRequestException('Invalid token');
    }

    // Idempotent upsert. Existing manual / bounce / complaint rows are
    // preserved; we only insert when missing.
    await this.prisma.emailSuppression.upsert({
      where: {
        tenantId_emailHash: { tenantId: payload.tenantId, emailHash: payload.emailHash },
      },
      create: {
        tenantId: payload.tenantId,
        email: '',
        emailHash: payload.emailHash,
        reason: 'unsubscribed',
        source: 'self.unsubscribe',
        notes: 'Self-unsubscribe via /unsubscribe link',
      },
      update: {},
    });

    // Also flip the customer profile subscriptionStatus when there's a
    // matching profile, so the suppression reason surfaces in customer
    // 360 too.
    await this.prisma.customerProfile.updateMany({
      where: { tenantId: payload.tenantId, emailHash: payload.emailHash },
      data: {
        isSubscribed: false,
        subscriptionStatus: 'unsubscribed',
      },
    });

    res.type('text/html').send(this.renderShell({
      title: 'Desuscripción confirmada',
      body: `
        <p>Listo. No vas a recibir más emails de marketing en esta dirección.</p>
        <p style="font-size: 12px; color: #888; margin-top: 16px;">
          Si fue un error, contactanos respondiendo al último email que recibiste.
        </p>
      `,
      contactInfo: await this.branding.findContactInfo(payload.tenantId),
    }));
  }

  private renderShell(args: {
    title: string;
    body: string;
    contactInfo?: { senderName: string | null; senderAddress: string | null } | null;
  }): string {
    const senderInfo =
      args.contactInfo && (args.contactInfo.senderName || args.contactInfo.senderAddress)
        ? `<div style="margin-top: 32px; font-size: 12px; color: #888;">
             ${args.contactInfo.senderName ? `<div>${escape(args.contactInfo.senderName)}</div>` : ''}
             ${args.contactInfo.senderAddress ? `<div>${escape(args.contactInfo.senderAddress)}</div>` : ''}
           </div>`
        : '';
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escape(args.title)}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111;">
  <main style="max-width: 480px; margin: 64px auto 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
    <h1 style="font-size: 22px; margin: 0 0 16px;">${escape(args.title)}</h1>
    ${args.body}
    ${senderInfo}
  </main>
</body>
</html>`;
  }
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import { PrepareSendService } from './prepare-send.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../../db/prisma.service';

const SendRecoverySchema = z.object({
  stageId: z.string().uuid(),
  /** When true, also call EmailService.dispatchSend right after preparing. */
  dispatch: z.boolean().default(true),
});

interface SendHistoryRow {
  id: string;
  campaign_id: string;
  campaign_name: string;
  stage_position: number;
  status: string;
  to_email: string;
  subject: string;
  coupon_code: string | null;
  coupon_source: string | null;
  recovery_url: string;
  resend_message_id: string | null;
  last_event_type: string | null;
  last_event_at: string | null;
  scheduled_for: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

interface SendRecoveryResponse {
  email_send_id: string;
  status: 'pending' | 'queued' | 'suppressed' | 'failed' | 'cancelled' | 'delivered' | 'bounced' | 'complained';
  recovery_url: string;
  coupon_code: string | null;
  resend_message_id: string | null;
  error_message: string | null;
}

@Controller({ path: 'admin/carts/abandoned/:id', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:carts:recovery')
export class RecoveryActionsController {
  constructor(
    private readonly prepareSend: PrepareSendService,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('sends')
  async listSends(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) cartId: string,
  ): Promise<{ data: SendHistoryRow[] }> {
    const tenantId = this.tenantOrThrow(user);
    await this.assertCartBelongsToTenant(tenantId, cartId);

    const rows = await this.prisma.emailSend.findMany({
      where: { tenantId, abandonedCartId: cartId },
      orderBy: { createdAt: 'desc' },
      include: {
        campaign: { select: { name: true } },
        stage: { select: { position: true } },
      },
    });
    return {
      data: rows.map((s) => ({
        id: s.id,
        campaign_id: s.campaignId,
        campaign_name: s.campaign.name,
        stage_position: s.stage.position,
        status: s.status,
        to_email: s.toEmail,
        subject: s.subject,
        coupon_code: s.couponCode,
        coupon_source: s.couponSource,
        recovery_url: s.recoveryUrl,
        resend_message_id: s.resendMessageId,
        last_event_type: s.lastEventType,
        last_event_at: s.lastEventAt?.toISOString() ?? null,
        scheduled_for: s.scheduledFor.toISOString(),
        sent_at: s.sentAt?.toISOString() ?? null,
        error_message: s.errorMessage,
        created_at: s.createdAt.toISOString(),
      })),
    };
  }

  @Post('send-recovery')
  async sendRecovery(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) cartId: string,
    @Body(new ZodValidationPipe(SendRecoverySchema)) body: z.infer<typeof SendRecoverySchema>,
  ): Promise<SendRecoveryResponse> {
    const tenantId = this.tenantOrThrow(user);
    await this.assertCartBelongsToTenant(tenantId, cartId);

    const result = await this.prepareSend.prepare({
      tenantId,
      abandonedCartId: cartId,
      stageId: body.stageId,
    });

    if (body.dispatch && result.status === 'pending') {
      await this.emailService.dispatchSend(result.emailSendId);
    }

    const after = await this.prisma.emailSend.findUniqueOrThrow({
      where: { id: result.emailSendId },
      select: {
        id: true,
        status: true,
        recoveryUrl: true,
        couponCode: true,
        resendMessageId: true,
        errorMessage: true,
      },
    });

    return {
      email_send_id: after.id,
      status: after.status as SendRecoveryResponse['status'],
      recovery_url: after.recoveryUrl,
      coupon_code: after.couponCode,
      resend_message_id: after.resendMessageId,
      error_message: after.errorMessage,
    };
  }

  private tenantOrThrow(user: AuthenticatedUser): string {
    if (!user.tenantId) {
      throw new ForbiddenException(
        'super_admin must impersonate a tenant for tenant-scoped endpoints',
      );
    }
    return user.tenantId;
  }

  private async assertCartBelongsToTenant(tenantId: string, cartId: string): Promise<void> {
    const cart = await this.prisma.abandonedCart.findUnique({
      where: { id: cartId },
      select: { tenantId: true },
    });
    if (!cart || cart.tenantId !== tenantId) {
      throw new BadRequestException(`Cart ${cartId} not found in tenant`);
    }
  }
}

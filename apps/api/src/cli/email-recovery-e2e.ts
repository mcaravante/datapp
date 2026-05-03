import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantService } from '../modules/tenant/tenant.service';
import { PrismaService } from '../db/prisma.service';
import { PrepareSendService } from '../modules/abandoned-cart-recovery/prepare-send.service';
import { EmailService } from '../modules/email/email.service';
import { TemplateRendererService } from '../modules/email/template-renderer.service';
import type { Env } from '../config/env';

/**
 * End-to-end smoke runner for the abandoned-cart recovery vertical.
 *
 * Usage:
 *   pnpm --filter @datapp/api cli email:e2e --cart=<abandonedCartId> [--stage=<stageId>] [--coupon-mode=<none|static|unique>] [--coupon-code=ABC123] [--send]
 *
 * What it does:
 *   1. Resolves tenant from DEFAULT_TENANT_SLUG.
 *   2. If --stage is not given, ensures a demo template + campaign + stage
 *      exist for the tenant ("cdp-recovery-stage-1") and uses that.
 *   3. Calls PrepareSendService.prepare() — this fetches the masked id
 *      from Magento, resolves the coupon, builds the recovery URL,
 *      runs suppression, and persists an EmailSend row.
 *   4. Prints the recovery URL, coupon, status, and rendered HTML preview.
 *   5. If --send is passed, calls EmailService.dispatchSend() — which
 *      hands the message to Resend. EMAIL_DRY_RUN suppresses sends to
 *      addresses outside EMAIL_TEST_RECIPIENT_ALLOWLIST.
 *
 * Notes:
 *   - Requires EMAIL_ENGINE_ENABLED=true to register the modules.
 *   - On first run with --coupon-mode=unique, creates a Magento sales rule.
 *   - The cart MUST have customer_email (not a guest cart). The CDP sync
 *     populates this from Magento's quote.customer_email.
 */
export async function runEmailRecoveryE2e(
  app: INestApplicationContext,
  argv: string[],
): Promise<number> {
  const logger = new Logger('email:e2e');
  const args = parseArgs(argv);
  const cartId = args['cart'];
  if (!cartId) {
    logger.error('Missing --cart=<abandonedCartId>');
    return 2;
  }

  const config = app.get(ConfigService) as ConfigService<Env, true>;
  if (!config.get('EMAIL_ENGINE_ENABLED', { infer: true })) {
    logger.error(
      'EMAIL_ENGINE_ENABLED=false. Set it to true (and provide RESEND_API_KEY, RESEND_WEBHOOK_SECRET, MAGENTO_STOREFRONT_URL) to run this command.',
    );
    return 2;
  }

  const tenants = app.get(TenantService);
  const prisma = app.get(PrismaService);
  const prepare = app.get(PrepareSendService);

  const tenantSlug = config.get('DEFAULT_TENANT_SLUG', { infer: true });
  const tenant = await tenants.findBySlug(tenantSlug);
  logger.log(`Tenant: ${tenant.slug} (${tenant.id})`);

  // Resolve or seed a demo stage.
  let stageId = args['stage'];
  const couponMode = (args['coupon-mode'] ?? 'none') as 'none' | 'static_code' | 'unique_code';
  const couponStaticCode = args['coupon-code'] ?? null;

  if (!stageId) {
    stageId = await ensureDemoStage({
      prisma,
      tenantId: tenant.id,
      couponMode,
      couponStaticCode,
    });
    logger.log(`Using demo stage ${stageId} (mode=${couponMode})`);
  }

  // Step 1 — prepare the send.
  logger.log(`Preparing send for cart=${cartId} stage=${stageId}`);
  const result = await prepare.prepare({
    tenantId: tenant.id,
    abandonedCartId: cartId,
    stageId,
  });

  logger.log(`EmailSend id=${result.emailSendId}`);
  logger.log(`Status:    ${result.status}`);
  logger.log(`Coupon:    ${result.couponCode ?? '— (no coupon)'}`);
  logger.log(`Recovery URL: ${result.recoveryUrl}`);

  // Render preview (non-mutating — re-uses the cached compile).
  const send = await prisma.emailSend.findUniqueOrThrow({
    where: { id: result.emailSendId },
    include: { stage: { include: { template: true } } },
  });
  const renderer = app.get(TemplateRendererService);
  const rendered = await renderer.render(
    send.stage.template,
    send.renderContext as Record<string, unknown>,
  );
  logger.log(`Subject:   ${rendered.subject}`);
  console.log('\n--- Rendered HTML preview (truncated) ---');
  console.log(rendered.html.slice(0, 800));
  console.log('--- end preview ---\n');

  // Step 2 — dispatch (only when --send is passed).
  if (args['send'] === '1' || args['send'] === 'true') {
    logger.log('Dispatching via Resend…');
    const emailService = app.get(EmailService);
    await emailService.dispatchSend(result.emailSendId);

    const after = await prisma.emailSend.findUniqueOrThrow({
      where: { id: result.emailSendId },
      select: { status: true, resendMessageId: true, errorMessage: true, sentAt: true },
    });
    logger.log(
      `Dispatch complete. status=${after.status} resendMessageId=${after.resendMessageId ?? '—'} sentAt=${after.sentAt?.toISOString() ?? '—'}`,
    );
    if (after.errorMessage) {
      logger.warn(`errorMessage: ${after.errorMessage}`);
    }
  } else {
    logger.log('Skipping dispatch (no --send flag). Pass --send to actually call Resend.');
  }

  return 0;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) {
      out[arg.slice(2)] = '1';
    } else {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    }
  }
  return out;
}

async function ensureDemoStage(args: {
  prisma: PrismaService;
  tenantId: string;
  couponMode: 'none' | 'static_code' | 'unique_code';
  couponStaticCode: string | null;
}): Promise<string> {
  const { prisma, tenantId, couponMode, couponStaticCode } = args;

  // Template
  const templateSlug = 'cdp-recovery-demo-stage-1';
  let template = await prisma.emailTemplate.findUnique({
    where: { tenantId_slug: { tenantId, slug: templateSlug } },
  });
  if (!template) {
    template = await prisma.emailTemplate.create({
      data: {
        tenantId,
        channel: 'abandoned_cart',
        slug: templateSlug,
        name: 'CDP Recovery Demo — stage 1',
        format: 'html',
        subject: 'Hola {{customer.firstName}}, te dejaste el carrito 🛒',
        bodyHtml: `<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; padding: 24px; max-width: 560px; margin: 0 auto;">
  <h1 style="font-size: 22px;">Hola {{customer.firstName}}</h1>
  <p>Notamos que dejaste algo en tu carrito.</p>
  <p>Tenés <strong>{{itemsCount}}</strong> productos por <strong>{{currencyCode}} {{grandTotal}}</strong>.</p>
  {{#if coupon}}
  <p style="background: #fff3cd; padding: 12px; border-radius: 6px;">Aplicamos <strong>{{coupon.code}}</strong> automáticamente al volver al carrito.</p>
  {{/if}}
  <p><a href="{{recoveryUrl}}" style="display: inline-block; background: #111; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none;">Volver al carrito</a></p>
  <p style="color: #888; font-size: 12px; margin-top: 32px;">Si ya completaste tu compra, ignorá este mensaje.</p>
</body></html>`,
        bodyText: 'Hola {{customer.firstName}}, te dejaste {{itemsCount}} productos en tu carrito por {{currencyCode}} {{grandTotal}}. Volvé al carrito: {{recoveryUrl}}',
        variables: { required: ['customer', 'itemsCount', 'grandTotal', 'currencyCode', 'recoveryUrl'] },
      },
    });
  }

  // Campaign
  const campaignSlug = 'cdp-recovery-demo';
  let campaign = await prisma.emailCampaign.findUnique({
    where: { tenantId_slug: { tenantId, slug: campaignSlug } },
  });
  if (!campaign) {
    campaign = await prisma.emailCampaign.create({
      data: {
        tenantId,
        slug: campaignSlug,
        name: 'CDP Recovery Demo',
        trigger: 'abandoned_cart_stage',
        status: 'active',
      },
    });
  }

  // Stage
  let stage = await prisma.emailCampaignStage.findUnique({
    where: { campaignId_position: { campaignId: campaign.id, position: 1 } },
  });
  if (!stage) {
    stage = await prisma.emailCampaignStage.create({
      data: {
        tenantId,
        campaignId: campaign.id,
        templateId: template.id,
        position: 1,
        delayHours: 1,
        couponMode,
        couponStaticCode,
        couponDiscount: couponMode === 'unique_code' ? '10' : null,
        couponDiscountType: couponMode === 'unique_code' ? 'percent' : null,
        couponTtlHours: couponMode === 'unique_code' ? 48 : null,
      },
    });
  } else if (stage.couponMode !== couponMode || stage.couponStaticCode !== couponStaticCode) {
    // Update stage to match args so the user can iterate without manual fixes.
    stage = await prisma.emailCampaignStage.update({
      where: { id: stage.id },
      data: {
        couponMode,
        couponStaticCode,
      },
    });
  }

  return stage.id;
}

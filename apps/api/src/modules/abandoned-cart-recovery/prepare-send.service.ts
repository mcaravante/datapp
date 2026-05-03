import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../db/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { MagentoClientFactory } from '../magento/magento-client.factory';
import { CouponStrategyService } from '../coupon-strategy/coupon-strategy.service';
import { EmailSuppressionService } from '../email-suppression/suppression.service';
import type { Env } from '../../config/env';
import type { AbandonedCart, EmailCampaignStage, EmailTemplate } from '@datapp/db';

export interface PrepareSendInput {
  tenantId: string;
  abandonedCartId: string;
  stageId: string;
}

export interface PrepareSendResult {
  /** The id of the new (or pre-existing) `EmailSend` row. */
  emailSendId: string;
  /** Recovery URL embedded in the rendered email — handy for CLI / manual debug. */
  recoveryUrl: string;
  /** Coupon attached to the recovery URL, or null if mode=`none`. */
  couponCode: string | null;
  /** Outcome at the moment prepare-send finished its own work. The
   *  follow-up dispatch step transitions further (queued/delivered/etc.). */
  status: 'pending' | 'suppressed';
}

/**
 * Orchestrator that turns an `AbandonedCart` + `EmailCampaignStage` into
 * a persisted `EmailSend` ready for `EmailService.dispatchSend`.
 *
 * Steps:
 *   1. Load the cart + stage + campaign + template + customer profile.
 *      Bail if anything is in a state where sending makes no sense (cart
 *      already recovered, campaign archived, stage inactive, no email
 *      address on the cart).
 *   2. Resolve the masked-quote-id (lazy: fetch from Magento on first
 *      use, persist on the cart row).
 *   3. Resolve the coupon via `CouponStrategyService`.
 *   4. Build the recovery URL `{storefront}/pupe_abandoned/cart/restore?token=…&coupon=…`.
 *   5. Build the render context (customer, cart items snapshot, recovery URL).
 *   6. Run pre-flight `suppression.shouldSend` BEFORE inserting any DB
 *      row — if blocked, we record the decision but skip the send.
 *   7. Insert the `EmailSend` row with the deterministic
 *      `idempotencyKey = send:{tenantId}:{cartId}:{stageId}`.
 *      A duplicate prepare returns the existing row.
 *
 * Idempotency: the unique `(tenantId, idempotencyKey)` constraint on
 * `EmailSend` makes step 7 safe under concurrent calls. On P2002
 * conflict we re-load the existing row and return it.
 */
@Injectable()
export class PrepareSendService {
  private readonly logger = new Logger(PrepareSendService.name);
  private readonly storefrontUrl: string;
  private readonly defaultFrom: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly magentoFactory: MagentoClientFactory,
    private readonly crypto: CryptoService,
    private readonly couponStrategy: CouponStrategyService,
    private readonly suppression: EmailSuppressionService,
    config: ConfigService<Env, true>,
  ) {
    const storefront = config.get('MAGENTO_STOREFRONT_URL', { infer: true });
    this.storefrontUrl = storefront ? storefront.replace(/\/+$/, '') : '';
    this.defaultFrom = config.get('RESEND_FROM_EMAIL', { infer: true });
  }

  async prepare(input: PrepareSendInput): Promise<PrepareSendResult> {
    if (!this.storefrontUrl) {
      throw new Error(
        'MAGENTO_STOREFRONT_URL is not set — required to build recovery URLs. See ADR 0007.',
      );
    }

    const idempotencyKey = `send:${input.tenantId}:${input.abandonedCartId}:${input.stageId}`;

    // Short-circuit if a row already exists. Manual retries / scheduler
    // overlap should be a no-op, not a duplicate row.
    const existing = await this.prisma.emailSend.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey } },
      select: { id: true, status: true, recoveryUrl: true, couponCode: true },
    });
    if (existing) {
      this.logger.debug(
        `Idempotent skip: EmailSend already exists for ${idempotencyKey} (id=${existing.id}, status=${existing.status})`,
      );
      return {
        emailSendId: existing.id,
        recoveryUrl: existing.recoveryUrl,
        couponCode: existing.couponCode,
        status: existing.status === 'suppressed' ? 'suppressed' : 'pending',
      };
    }

    const cart = await this.prisma.abandonedCart.findUnique({
      where: { id: input.abandonedCartId },
      include: { magentoStore: true, customer: true },
    });
    if (!cart) {
      throw new NotFoundException(`AbandonedCart ${input.abandonedCartId} not found`);
    }
    if (cart.tenantId !== input.tenantId) {
      throw new Error(
        `AbandonedCart ${cart.id} does not belong to tenant ${input.tenantId}`,
      );
    }
    if (cart.status !== 'open') {
      throw new Error(
        `AbandonedCart ${cart.id} is in status=${cart.status}; only open carts can be recovered`,
      );
    }
    if (!cart.customerEmail) {
      throw new Error(
        `AbandonedCart ${cart.id} has no customer_email — guest cart not stitched`,
      );
    }

    const stage = await this.prisma.emailCampaignStage.findUnique({
      where: { id: input.stageId },
      include: { campaign: true, template: true },
    });
    if (!stage) {
      throw new NotFoundException(`EmailCampaignStage ${input.stageId} not found`);
    }
    if (!stage.isActive) {
      throw new Error(`Stage ${stage.id} is inactive`);
    }
    if (stage.tenantId !== input.tenantId) {
      throw new Error(`Stage ${stage.id} does not belong to tenant ${input.tenantId}`);
    }
    if (stage.campaign.status !== 'active' && stage.campaign.status !== 'draft') {
      throw new Error(
        `Campaign ${stage.campaign.id} is in status=${stage.campaign.status}; cannot prepare new sends`,
      );
    }

    // Build a Magento client for this store.
    const store = await this.resolveStore(cart);
    const magento = this.magentoFactory.forStore(store);

    // Step 2 — masked quote id (lazy).
    const maskedId = await this.resolveMaskedId(cart, magento);

    // Step 3 — coupon.
    const coupon = await this.couponStrategy.resolve(stage, magento);

    // Step 4 — recovery URL.
    const recoveryUrl = this.buildRecoveryUrl(maskedId, coupon.code);

    // Step 5 — render context.
    const renderContext = this.buildRenderContext(cart, stage, recoveryUrl, coupon.code);

    // Step 6 — pre-flight suppression.
    const decision = await this.suppression.shouldSend({
      tenantId: input.tenantId,
      email: cart.customerEmail,
    });

    // Step 7 — persist EmailSend row.
    const baseData = {
      tenantId: input.tenantId,
      campaignId: stage.campaignId,
      stageId: stage.id,
      abandonedCartId: cart.id,
      customerProfileId: cart.customerProfileId,
      toEmail: cart.customerEmail.trim().toLowerCase(),
      toEmailHash: EmailSuppressionService.hashEmail(cart.customerEmail),
      fromEmail: stage.campaign.fromEmail ?? this.defaultFrom,
      subject: this.previewSubject(stage.template, renderContext),
      idempotencyKey,
      couponCode: coupon.code,
      couponSource: coupon.source,
      magentoSalesRuleId: coupon.salesRuleId,
      recoveryUrl,
      renderContext: renderContext as object,
      scheduledFor: new Date(),
    };

    const data = decision.allow
      ? { ...baseData, status: 'pending' as const }
      : {
          ...baseData,
          status: 'suppressed' as const,
          errorMessage: `${decision.reason}: ${decision.message}`,
        };

    try {
      const created = await this.prisma.emailSend.create({ data });
      this.logger.log(
        `Prepared EmailSend ${created.id} for cart ${cart.id} stage ${stage.position.toString()} (status=${created.status}, coupon=${coupon.code ?? '—'})`,
      );
      return {
        emailSendId: created.id,
        recoveryUrl,
        couponCode: coupon.code,
        status: created.status === 'suppressed' ? 'suppressed' : 'pending',
      };
    } catch (err) {
      // P2002 (unique constraint) → another worker beat us to it; load.
      const code = (err as { code?: string }).code;
      if (code === 'P2002') {
        const winner = await this.prisma.emailSend.findUnique({
          where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey } },
          select: { id: true, status: true, recoveryUrl: true, couponCode: true },
        });
        if (winner) {
          return {
            emailSendId: winner.id,
            recoveryUrl: winner.recoveryUrl,
            couponCode: winner.couponCode,
            status: winner.status === 'suppressed' ? 'suppressed' : 'pending',
          };
        }
      }
      throw err;
    }
  }

  private async resolveStore(cart: AbandonedCart & { magentoStore: { adminTokenEncrypted: Buffer; baseUrl: string; hmacSecretEncrypted: Buffer; tenantId: string; id: string; name: string; currencyCode: string; defaultCountry: string } }) {
    return {
      id: cart.magentoStore.id,
      tenantId: cart.magentoStore.tenantId,
      name: cart.magentoStore.name,
      baseUrl: cart.magentoStore.baseUrl,
      hmacSecret: this.crypto.decrypt(cart.magentoStore.hmacSecretEncrypted),
      adminToken: this.crypto.decrypt(cart.magentoStore.adminTokenEncrypted),
      currencyCode: cart.magentoStore.currencyCode,
      defaultCountry: cart.magentoStore.defaultCountry,
    };
  }

  private async resolveMaskedId(
    cart: { id: string; magentoCartId: number; magentoMaskedQuoteId: string | null },
    magento: ReturnType<MagentoClientFactory['forStore']>,
  ): Promise<string> {
    if (cart.magentoMaskedQuoteId) return cart.magentoMaskedQuoteId;

    const masked = await magento.carts.getMaskedId(cart.magentoCartId);
    await this.prisma.abandonedCart.update({
      where: { id: cart.id },
      data: { magentoMaskedQuoteId: masked },
    });
    return masked;
  }

  private buildRecoveryUrl(maskedId: string, coupon: string | null): string {
    const params = new URLSearchParams({ token: maskedId });
    if (coupon) params.set('coupon', coupon);
    return `${this.storefrontUrl}/pupe_abandoned/cart/restore?${params.toString()}`;
  }

  private buildRenderContext(
    cart: { customerName: string | null; customerEmail: string | null; itemsCount: number; itemsQty: number; subtotal: { toString(): string }; grandTotal: { toString(): string }; currencyCode: string | null },
    stage: EmailCampaignStage & { campaign: { name: string } },
    recoveryUrl: string,
    couponCode: string | null,
  ): Record<string, unknown> {
    return {
      customer: {
        firstName: this.firstName(cart.customerName),
        email: cart.customerEmail,
      },
      itemsCount: cart.itemsCount,
      itemsQty: cart.itemsQty,
      subtotal: cart.subtotal.toString(),
      grandTotal: cart.grandTotal.toString(),
      currencyCode: cart.currencyCode ?? 'ARS',
      recoveryUrl,
      coupon: couponCode ? { code: couponCode } : null,
      campaign: { name: stage.campaign.name, stagePosition: stage.position },
    };
  }

  private firstName(full: string | null): string {
    if (!full) return 'cliente';
    const trimmed = full.trim();
    if (trimmed === '') return 'cliente';
    const space = trimmed.indexOf(' ');
    return space === -1 ? trimmed : trimmed.slice(0, space);
  }

  private previewSubject(template: EmailTemplate, ctx: Record<string, unknown>): string {
    // Cheap subject preview using a primitive template substitution.
    // The real, escaping-aware Handlebars render happens inside
    // EmailService.dispatchSend; this is just a placeholder so the
    // EmailSend row is searchable in the admin UI.
    return template.subject.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
      const v = path
        .split('.')
        .reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), ctx);
      return v === undefined || v === null ? '' : String(v);
    });
  }
}

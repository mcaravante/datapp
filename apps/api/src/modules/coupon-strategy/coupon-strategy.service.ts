import { Injectable, Logger } from '@nestjs/common';
import type { MagentoClient, MagentoSalesRule } from '@datapp/magento-client';
import type { CouponMode, EmailCampaignStage } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';

export interface CouponDecision {
  /** The literal code to inject into the email + recovery URL. Null when mode is `none`. */
  code: string | null;
  /** The Magento sales-rule id this code belongs to. Null for `none` and `static_code`. */
  salesRuleId: number | null;
  /** Echo of the mode used — persisted on `EmailSend.couponSource` for audit. */
  source: CouponMode;
}

/**
 * Resolves the per-send coupon for a given `EmailCampaignStage`.
 *
 * Modes:
 *   - `none`         → `{ code: null, salesRuleId: null }`. No Magento call.
 *   - `static_code`  → `{ code: stage.couponStaticCode, salesRuleId: null }`.
 *                      Operator pre-creates the rule in Magento; CDP
 *                      only injects the literal.
 *   - `unique_code`  → Lazily creates one Magento sales rule per stage on
 *                      first use, then calls `/V1/coupons/generate` to
 *                      issue one new code per send.
 *
 * Concurrency note: two concurrent prepare-send jobs for the same stage
 * (different carts) can race to create the rule. We tolerate the worst
 * case (one orphan duplicate rule) — both rules will work, and the
 * stage's `magentoSalesRuleId` ends up pointing at whichever update won.
 * The orphan can be cleaned up later by ops if needed.
 */
@Injectable()
export class CouponStrategyService {
  private readonly logger = new Logger(CouponStrategyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(stage: EmailCampaignStage, magento: MagentoClient): Promise<CouponDecision> {
    switch (stage.couponMode) {
      case 'none':
        return { code: null, salesRuleId: null, source: 'none' };

      case 'static_code': {
        if (!stage.couponStaticCode || stage.couponStaticCode.trim() === '') {
          this.logger.warn(
            `Stage ${stage.id} mode=static_code but couponStaticCode is empty — falling back to no coupon`,
          );
          return { code: null, salesRuleId: null, source: 'none' };
        }
        return {
          code: stage.couponStaticCode,
          salesRuleId: null,
          source: 'static_code',
        };
      }

      case 'unique_code': {
        const ruleId = await this.ensureSalesRule(stage, magento);
        const codes = await magento.salesRules.generateCoupons({
          couponSpec: {
            rule_id: ruleId,
            quantity: 1,
            length: 12,
            format: 'alphanumeric',
          },
        });
        if (codes.length !== 1 || !codes[0]) {
          throw new Error(
            `Magento generateCoupons returned ${codes.length.toString()} codes for rule ${ruleId.toString()} (expected 1)`,
          );
        }
        return { code: codes[0], salesRuleId: ruleId, source: 'unique_code' };
      }
    }
  }

  /**
   * Returns the stage's Magento sales-rule id, creating the rule lazily
   * if it doesn't exist yet. The created rule has `coupon_type=3`
   * (auto-generated coupons) and `use_auto_generation=true` so subsequent
   * `coupons/generate` calls work.
   */
  private async ensureSalesRule(
    stage: EmailCampaignStage,
    magento: MagentoClient,
  ): Promise<number> {
    if (stage.magentoSalesRuleId) {
      return stage.magentoSalesRuleId;
    }

    const rule = await magento.salesRules.create({
      rule: this.buildRulePayload(stage),
    });

    await this.prisma.emailCampaignStage.update({
      where: { id: stage.id },
      data: { magentoSalesRuleId: rule.rule_id },
    });

    this.logger.log(
      `Created Magento sales-rule ${rule.rule_id.toString()} for stage ${stage.id} (campaign=${stage.campaignId})`,
    );
    return rule.rule_id;
  }

  private buildRulePayload(stage: EmailCampaignStage): Partial<MagentoSalesRule> {
    const discountAmount = stage.couponDiscount
      ? Number(stage.couponDiscount.toString())
      : 0;
    const simpleAction =
      stage.couponDiscountType === 'fixed' ? 'cart_fixed' : 'by_percent';

    const payload: Partial<MagentoSalesRule> = {
      name: `CDP recovery — stage ${stage.id}`,
      is_active: true,
      coupon_type: 3,
      use_auto_generation: true,
      uses_per_coupon: 1,
      uses_per_customer: 1,
      simple_action: simpleAction,
      discount_amount: discountAmount,
      website_ids: [1],
      customer_group_ids: [0, 1, 2, 3],
      stop_rules_processing: false,
    };

    if (stage.couponTtlHours && stage.couponTtlHours > 0) {
      // Magento expects ISO date strings; rule applies between from_date
      // and to_date inclusive.
      const now = new Date();
      const expiry = new Date(now.getTime() + stage.couponTtlHours * 60 * 60 * 1000);
      payload.from_date = now.toISOString().slice(0, 10);
      payload.to_date = expiry.toISOString().slice(0, 10);
    }

    return payload;
  }
}

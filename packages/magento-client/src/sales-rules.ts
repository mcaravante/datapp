import type { MagentoHttpClient } from './http';
import {
  MagentoSalesRuleSchema,
  MagentoCouponGenerateInputSchema,
  MagentoCouponGenerateOutputSchema,
  type MagentoSalesRule,
  type MagentoCouponGenerateInput,
  type MagentoCouponGenerateOutput,
} from './schemas';
import { z } from 'zod';

/**
 * Phase 3 — abandoned-cart recovery vertical.
 *
 * Wraps Magento's `salesRule` and `coupons` REST surfaces. Used by the
 * coupon-strategy service in `apps/api` to lazily create one rule per
 * `EmailCampaignStage` (when `couponMode='unique'`) and generate a unique
 * code per send via `/V1/coupons/generate`.
 *
 * Endpoint reference:
 *   POST   /rest/V1/salesRules           → `create`
 *   GET    /rest/V1/salesRules/:id       → `get`
 *   PUT    /rest/V1/salesRules/:id       → `update`
 *   DELETE /rest/V1/salesRules/:id       → `remove`  (cascades coupons)
 *   POST   /rest/V1/coupons/generate     → `generateCoupons`
 *   POST   /rest/V1/coupons/deleteByIds  → `deleteCouponsByIds`
 */
export class MagentoSalesRulesResource {
  constructor(private readonly http: MagentoHttpClient) {}

  /** `POST /V1/salesRules` — body shape: `{ rule: {...} }`. */
  async create(input: { rule: Partial<MagentoSalesRule> }): Promise<MagentoSalesRule> {
    const raw = await this.http.postJson<unknown>('/rest/V1/salesRules', input);
    return MagentoSalesRuleSchema.parse(raw);
  }

  /** `GET /V1/salesRules/:id`. */
  async get(ruleId: number): Promise<MagentoSalesRule> {
    const raw = await this.http.getJson<unknown>(`/rest/V1/salesRules/${ruleId.toString()}`);
    return MagentoSalesRuleSchema.parse(raw);
  }

  /** `PUT /V1/salesRules/:id` — body shape: `{ rule: {...} }`. */
  async update(ruleId: number, rule: Partial<MagentoSalesRule>): Promise<MagentoSalesRule> {
    const raw = await this.http.putJson<unknown>(`/rest/V1/salesRules/${ruleId.toString()}`, {
      rule,
    });
    return MagentoSalesRuleSchema.parse(raw);
  }

  /**
   * `DELETE /V1/salesRules/:id`. Magento returns the literal JSON `true`
   * on success and cascades all generated coupons under the rule.
   */
  async remove(ruleId: number): Promise<true> {
    const raw = await this.http.deleteJson<unknown>(`/rest/V1/salesRules/${ruleId.toString()}`);
    if (raw !== true) {
      throw new Error(
        `Magento DELETE /V1/salesRules/${ruleId.toString()} returned ${JSON.stringify(raw)} instead of true`,
      );
    }
    return true;
  }

  /**
   * `POST /V1/coupons/generate` — generates one or more codes for an
   * existing auto-generation rule (`coupon_type=3`). Returns the array of
   * generated codes in the order Magento created them.
   */
  async generateCoupons(input: MagentoCouponGenerateInput): Promise<MagentoCouponGenerateOutput> {
    const validated = MagentoCouponGenerateInputSchema.parse(input);
    const raw = await this.http.postJson<unknown>('/rest/V1/coupons/generate', validated);
    return MagentoCouponGenerateOutputSchema.parse(raw);
  }

  /**
   * `POST /V1/coupons/deleteByIds` — body `{ ids: [...], ignoreInvalidCoupons: true }`.
   * Returns `{ missing_items: [{ id, message }] }` for any ids that
   * couldn't be deleted. We always set `ignoreInvalidCoupons=true`
   * because an unknown id is not a fatal error for cleanup flows.
   */
  async deleteCouponsByIds(
    ids: number[],
  ): Promise<{ missing_items: { id: number; message: string }[] }> {
    const raw = await this.http.postJson<unknown>('/rest/V1/coupons/deleteByIds', {
      ids,
      ignoreInvalidCoupons: true,
    });
    return MagentoCouponDeleteResponseSchema.parse(raw);
  }
}

const MagentoCouponDeleteResponseSchema = z
  .object({
    missing_items: z
      .array(z.object({ id: z.number().int(), message: z.string() }))
      .default([]),
  })
  .passthrough();

import { z } from 'zod';

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const EmailCampaignTriggerSchema = z.enum(['abandoned_cart_stage']);
export const EmailCampaignStatusSchema = z.enum(['draft', 'active', 'paused', 'archived']);
export const CouponModeSchema = z.enum(['none', 'static_code', 'unique_code']);

const COUPON_CODE_REGEX = /^[A-Z0-9_-]{4,32}$/;

export const StageInputSchema = z
  .object({
    position: z.number().int().min(1).max(99),
    delayHours: z.number().int().min(0).max(24 * 90),
    templateId: z.string().uuid(),
    couponMode: CouponModeSchema.default('none'),
    couponStaticCode: z
      .string()
      .regex(COUPON_CODE_REGEX, 'Coupon must be 4–32 chars, A-Z 0-9 _ -')
      .optional()
      .nullable(),
    couponDiscount: z
      .union([z.string(), z.number()])
      .transform((v) => (typeof v === 'number' ? v.toString() : v))
      .optional()
      .nullable(),
    couponDiscountType: z.enum(['percent', 'fixed']).optional().nullable(),
    couponTtlHours: z.number().int().min(1).max(24 * 365).optional().nullable(),
    isActive: z.boolean().default(true),
  })
  .superRefine((stage, ctx) => {
    if (stage.couponMode === 'static_code') {
      if (!stage.couponStaticCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['couponStaticCode'],
          message: 'Required when couponMode = static_code',
        });
      }
    }
    if (stage.couponMode === 'unique_code') {
      if (!stage.couponDiscount || !stage.couponDiscountType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['couponDiscount'],
          message: 'couponDiscount + couponDiscountType required when couponMode = unique_code',
        });
      }
    }
  });
export type StageInput = z.infer<typeof StageInputSchema>;

export const CreateEmailCampaignSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(SLUG_REGEX, 'Lower-case letters, digits, and hyphens only'),
  name: z.string().min(1).max(120),
  trigger: EmailCampaignTriggerSchema.default('abandoned_cart_stage'),
  status: EmailCampaignStatusSchema.default('draft'),
  fromEmail: z.string().email().optional().nullable(),
  replyToEmail: z.string().email().optional().nullable(),
  /** Stages can be created together with the campaign in one shot. */
  stages: z.array(StageInputSchema).max(10).default([]),
});
export type CreateEmailCampaignBody = z.infer<typeof CreateEmailCampaignSchema>;

export const UpdateEmailCampaignSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  trigger: EmailCampaignTriggerSchema.optional(),
  status: EmailCampaignStatusSchema.optional(),
  fromEmail: z.string().email().optional().nullable(),
  replyToEmail: z.string().email().optional().nullable(),
});
export type UpdateEmailCampaignBody = z.infer<typeof UpdateEmailCampaignSchema>;

/**
 * Replace ALL stages in one transaction. Simpler than per-stage CRUD for
 * the admin UI: the form posts the full stage list. Diff happens
 * server-side (delete missing, update existing by position, create new).
 */
export const ReplaceStagesSchema = z.object({
  stages: z.array(StageInputSchema).max(10),
});
export type ReplaceStagesBody = z.infer<typeof ReplaceStagesSchema>;

export interface EmailCampaignStageDto {
  id: string;
  position: number;
  delay_hours: number;
  template_id: string;
  template_slug: string;
  template_name: string;
  coupon_mode: 'none' | 'static_code' | 'unique_code';
  coupon_static_code: string | null;
  magento_sales_rule_id: number | null;
  coupon_discount: string | null;
  coupon_discount_type: 'percent' | 'fixed' | null;
  coupon_ttl_hours: number | null;
  is_active: boolean;
}

export interface EmailCampaignSummary {
  id: string;
  slug: string;
  name: string;
  trigger: 'abandoned_cart_stage';
  status: 'draft' | 'active' | 'paused' | 'archived';
  stage_count: number;
  send_count_30d: number;
  created_at: string;
  updated_at: string;
}

export interface EmailCampaignDetail extends EmailCampaignSummary {
  from_email: string | null;
  reply_to_email: string | null;
  archived_at: string | null;
  stages: EmailCampaignStageDto[];
}

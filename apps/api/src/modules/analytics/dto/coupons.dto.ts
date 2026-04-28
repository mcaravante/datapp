import { z } from 'zod';
import { AnalyticsRangeSchema } from './range.dto';

export const CouponsQuerySchema = AnalyticsRangeSchema;
export type CouponsQuery = z.infer<typeof CouponsQuerySchema>;

export interface CouponRow {
  /** The literal code typed by the customer (e.g. `WELCOME10`). */
  code: string;
  /** Most-common rule label/description for this code. */
  name: string | null;
  /** Distinct orders where this code was applied. */
  orders: number;
  /** Distinct customers (CDP profiles) that used the code. Null = guest. */
  customers: number;
  /** Sum of `grand_total` (post-discount, what the customer paid). */
  gross_revenue: string;
  /** Sum of |discount_amount| — total amount given away. Always positive. */
  discount_total: string;
  /** Sum of `real_revenue` (invoiced − refunded). */
  net_revenue: string;
  first_used_at: string;
  last_used_at: string;
}

export interface CouponsResponse {
  range: { from: string; to: string };
  totals: {
    coupon_orders: number;
    coupon_revenue: string;
    discount_total: string;
    /** Orders in range that had a discount but no coupon code (auto cart-rules). */
    auto_promo_orders: number;
    auto_promo_discount: string;
  };
  data: CouponRow[];
}

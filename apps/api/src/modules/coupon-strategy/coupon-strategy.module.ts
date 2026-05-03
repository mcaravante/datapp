import { Module } from '@nestjs/common';
import { CouponStrategyService } from './coupon-strategy.service';

/**
 * Phase 3 — Resolves a per-send coupon code based on the stage's
 * `couponMode` (`none` / `static_code` / `unique_code`). For `unique_code`,
 * lazily creates a Magento sales rule on the stage and calls
 * `/V1/coupons/generate` per send.
 */
@Module({
  providers: [CouponStrategyService],
  exports: [CouponStrategyService],
})
export class CouponStrategyModule {}

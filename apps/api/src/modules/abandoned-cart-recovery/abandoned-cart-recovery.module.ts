import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { EmailSuppressionModule } from '../email-suppression/email-suppression.module';
import { CouponStrategyModule } from '../coupon-strategy/coupon-strategy.module';
import { PrepareSendService } from './prepare-send.service';
import { RecoveryActionsController } from './recovery-actions.controller';

/**
 * Phase 3 — Recovery scheduler + prepare-send orchestrator + cart-recovery
 * listener. Sibling to `CartsModule` (which owns the read-only sync sweep).
 *
 * The `RecoveryActionsController` exposes per-cart manual send + send
 * history under `/v1/admin/carts/abandoned/:id/...` so admin UI can
 * trigger a recovery email synchronously from the cart detail page.
 */
@Module({
  imports: [EmailModule, EmailSuppressionModule, CouponStrategyModule],
  controllers: [RecoveryActionsController],
  providers: [PrepareSendService],
  exports: [PrepareSendService],
})
export class AbandonedCartRecoveryModule {}

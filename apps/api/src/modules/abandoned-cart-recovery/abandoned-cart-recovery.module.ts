import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailModule } from '../email/email.module';
import { EmailSuppressionModule } from '../email-suppression/email-suppression.module';
import { CouponStrategyModule } from '../coupon-strategy/coupon-strategy.module';
import { QUEUES } from '../queue/queue.constants';
import { PrepareSendService } from './prepare-send.service';
import { PrepareSendProcessor } from './prepare-send.processor';
import {
  RecoverySchedulerProcessor,
  RecoverySchedulerService,
} from './recovery-scheduler.service';
import { RecoveryActionsController } from './recovery-actions.controller';
import { CartRecoveryListener } from './cart-recovery-listener.service';

/**
 * Phase 3 — Recovery scheduler + prepare-send orchestrator + cart-recovery
 * listener. Sibling to `CartsModule` (which owns the read-only sync sweep).
 */
@Module({
  imports: [
    EmailModule,
    EmailSuppressionModule,
    CouponStrategyModule,
    BullModule.registerQueue(
      { name: QUEUES.emailRecoverySchedule },
      { name: QUEUES.emailRecoveryPrepare },
      { name: QUEUES.emailSend },
    ),
  ],
  controllers: [RecoveryActionsController],
  providers: [
    PrepareSendService,
    PrepareSendProcessor,
    RecoverySchedulerService,
    RecoverySchedulerProcessor,
    CartRecoveryListener,
  ],
  exports: [PrepareSendService],
})
export class AbandonedCartRecoveryModule {}

import { Module } from '@nestjs/common';
import { EmailSuppressionService } from './suppression.service';

/**
 * Phase 3 — Centralized suppression / send-eligibility checks. Every send
 * (scheduled, ad-hoc, manual) goes through this module's `shouldSend`
 * decision so the test-allowlist hard-lock and frequency caps cannot be
 * bypassed.
 */
@Module({
  providers: [EmailSuppressionService],
  exports: [EmailSuppressionService],
})
export class EmailSuppressionModule {}

import { Module } from '@nestjs/common';
import { EmailSuppressionModule } from '../email-suppression/email-suppression.module';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { UnsubscribeController } from './unsubscribe.controller';

/**
 * Phase 3 — tenant email branding (header logo / footer / sender info)
 * + public unsubscribe endpoint.
 *
 * Loaded unconditionally (NOT gated by EMAIL_ENGINE_ENABLED) so the
 * `/unsubscribe/:token` URLs in already-sent emails keep working even
 * if an operator temporarily turns the engine off.
 */
@Module({
  imports: [EmailSuppressionModule],
  controllers: [BrandingController, UnsubscribeController],
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}

import { Module } from '@nestjs/common';
import { PopupsAdminController } from './popups.controller';
import { PublicPopupsController } from './public-popups.controller';
import { PopupsService } from './popups.service';

/**
 * Phase 2 — popup builder vertical (per ADR 0008). Admin CRUD on
 * `Form` (popups), public read for the storefront loader, public
 * ingest for form submissions.
 */
@Module({
  controllers: [PopupsAdminController, PublicPopupsController],
  providers: [PopupsService],
  exports: [PopupsService],
})
export class PopupsModule {}

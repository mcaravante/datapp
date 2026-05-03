import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { EmailTemplatesController } from './templates.controller';
import { EmailTemplatesService } from './templates.service';

/**
 * Phase 3 — Admin CRUD for `EmailCampaign`, `EmailCampaignStage`, and
 * `EmailTemplate`, plus `/v1/admin/email-templates/:id/preview`.
 */
@Module({
  imports: [EmailModule],
  controllers: [CampaignsController, EmailTemplatesController],
  providers: [CampaignsService, EmailTemplatesService],
  exports: [CampaignsService, EmailTemplatesService],
})
export class CampaignsModule {}

import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ExcludedEmailsService } from './excluded-emails.service';
import { MethodLabelsService } from './method-labels.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, ExcludedEmailsService, MethodLabelsService],
  exports: [AnalyticsService, ExcludedEmailsService, MethodLabelsService],
})
export class AnalyticsModule {}

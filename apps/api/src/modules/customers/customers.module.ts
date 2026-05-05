import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerSyncService } from './customer-sync.service';
import { GdprService } from './gdpr.service';

@Module({
  imports: [AnalyticsModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerSyncService, GdprService],
  exports: [CustomerSyncService],
})
export class CustomersModule {}

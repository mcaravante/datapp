import { Module } from '@nestjs/common';
import { CustomerSyncService } from './customer-sync.service';

@Module({
  providers: [CustomerSyncService],
  exports: [CustomerSyncService],
})
export class CustomersModule {}

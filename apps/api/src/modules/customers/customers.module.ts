import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerSyncService } from './customer-sync.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomerSyncService],
  exports: [CustomerSyncService],
})
export class CustomersModule {}

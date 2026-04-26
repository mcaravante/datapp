import { Module } from '@nestjs/common';
import { OrderSyncService } from './order-sync.service';

@Module({
  providers: [OrderSyncService],
  exports: [OrderSyncService],
})
export class OrdersModule {}

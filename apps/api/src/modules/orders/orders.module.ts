import { Module } from '@nestjs/common';
import { OrderSyncService } from './order-sync.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrdersController],
  providers: [OrderSyncService, OrdersService],
  exports: [OrderSyncService, OrdersService],
})
export class OrdersModule {}

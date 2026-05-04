import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '../queue/queue.constants';
import { OrderSyncService } from './order-sync.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderBackfillService } from './order-backfill.service';
import {
  OrderBackfillProcessor,
  OrderBackfillScheduler,
} from './order-backfill.scheduler';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.ordersBackfill })],
  controllers: [OrdersController],
  providers: [
    OrderSyncService,
    OrdersService,
    OrderBackfillService,
    OrderBackfillScheduler,
    OrderBackfillProcessor,
  ],
  exports: [OrderSyncService, OrdersService, OrderBackfillService],
})
export class OrdersModule {}

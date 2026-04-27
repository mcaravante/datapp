import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { OrdersModule } from '../orders/orders.module';
import { HmacGuard } from './hmac.guard';
import { IngestController } from './ingest.controller';
import { IngestProcessor } from './ingest.processor';
import { SyncStatusController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [CustomersModule, OrdersModule],
  controllers: [IngestController, SyncStatusController],
  providers: [SyncService, HmacGuard, IngestProcessor],
  exports: [SyncService],
})
export class SyncModule {}

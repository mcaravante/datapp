import { Module } from '@nestjs/common';
import { HmacGuard } from './hmac.guard';
import { IngestController } from './ingest.controller';
import { SyncStatusController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  controllers: [IngestController, SyncStatusController],
  providers: [SyncService, HmacGuard],
  exports: [SyncService],
})
export class SyncModule {}

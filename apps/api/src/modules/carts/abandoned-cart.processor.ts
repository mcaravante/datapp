import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../queue/queue.constants';
import { AbandonedCartSyncService } from './abandoned-cart-sync.service';

export interface AbandonedCartSyncJobData {
  tenantId: string;
  storeName?: string;
}

/**
 * BullMQ processor that runs the abandoned-cart sweep on the schedule
 * registered in `CartsModule.onModuleInit` (every 15 minutes per
 * tenant). Idempotent — safe to retry on failure; partial work is
 * preserved by the upsert in the sync service.
 */
@Processor(QUEUES.cartsAbandonedSync)
export class AbandonedCartSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(AbandonedCartSyncProcessor.name);

  constructor(private readonly sync: AbandonedCartSyncService) {
    super();
  }

  async process(job: Job<AbandonedCartSyncJobData>): Promise<{ ok: true; carts: number }> {
    const { tenantId, storeName } = job.data;
    this.logger.log(
      `Abandoned cart sync — tenant=${tenantId} store=${storeName ?? '<first>'} job=${job.id ?? '?'}`,
    );
    const result = await this.sync.sweepStore(tenantId, storeName);
    return { ok: true, carts: result.upserted };
  }
}

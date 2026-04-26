import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../queue/queue.constants';
import { RfmService } from './rfm.service';

export interface RfmJobData {
  tenantId: string;
}

/**
 * BullMQ processor for the nightly RFM scoring job. Registered with
 * `@Processor(QUEUES.analyticsRfmNightly)` so the worker entry point
 * (`apps/api/src/worker.ts`) consumes it automatically.
 *
 * The repeatable schedule is created in `RfmModule.onModuleInit` once
 * per tenant. A direct `cli rfm:compute <tenant>` is also provided for
 * on-demand runs.
 */
@Processor(QUEUES.analyticsRfmNightly)
export class RfmProcessor extends WorkerHost {
  private readonly logger = new Logger(RfmProcessor.name);

  constructor(private readonly rfm: RfmService) {
    super();
  }

  async process(job: Job<RfmJobData>): Promise<{ ok: true; customers: number }> {
    const { tenantId } = job.data;
    this.logger.log(`RFM job picked up — tenant=${tenantId} job=${job.id ?? '?'}`);
    const result = await this.rfm.run(tenantId);
    return { ok: true, customers: result.customers };
  }
}

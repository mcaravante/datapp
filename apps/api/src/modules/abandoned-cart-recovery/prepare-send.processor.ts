import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, type Queue } from 'bullmq';
import { QUEUES } from '../queue/queue.constants';
import { PrepareSendService } from './prepare-send.service';

interface PrepareJobData {
  tenantId: string;
  abandonedCartId: string;
  stageId: string;
}

/**
 * Consumer for `email.recovery.prepare`.
 *
 * Calls `PrepareSendService.prepare`, which idempotently creates an
 * `EmailSend` row, builds the recovery URL, resolves the masked id and
 * coupon. When the result is `pending`, enqueue a follow-up job onto
 * `email.send` to actually deliver via Resend. When it's `suppressed`,
 * we stop here — the row already records the suppression reason.
 */
@Processor(QUEUES.emailRecoveryPrepare, { concurrency: 4 })
@Injectable()
export class PrepareSendProcessor extends WorkerHost {
  private readonly logger = new Logger(PrepareSendProcessor.name);

  constructor(
    private readonly prepareSend: PrepareSendService,
    @InjectQueue(QUEUES.emailSend) private readonly sendQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<PrepareJobData>): Promise<void> {
    const { tenantId, abandonedCartId, stageId } = job.data;

    const result = await this.prepareSend.prepare({
      tenantId,
      abandonedCartId,
      stageId,
    });

    if (result.status === 'suppressed') {
      this.logger.debug(
        `prepare-send ${result.emailSendId}: suppressed at prepare time, skipping dispatch`,
      );
      return;
    }

    // Status === 'pending' → hand off to the send queue.
    const idempotencyKey = `send:${tenantId}:${abandonedCartId}:${stageId}`;
    await this.sendQueue.add(
      'email-send',
      { emailSendId: result.emailSendId },
      {
        jobId: idempotencyKey,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 14 * 24 * 60 * 60 },
      },
    );
  }
}

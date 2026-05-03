import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUES } from '../queue/queue.constants';
import { EmailService } from './email.service';

interface SendJobData {
  emailSendId: string;
}

/**
 * Consumer for `email.send`. Hands the `EmailSend` to the dispatcher
 * which deals with suppression re-checks, rendering, Resend ack, and
 * status transitions. BullMQ retries handle transient Resend errors;
 * permanent errors transition the row to `failed` inside dispatchSend
 * and the job completes (no rethrow → no retry on a poison pill).
 */
@Processor(QUEUES.emailSend, { concurrency: 4 })
@Injectable()
export class EmailSendProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailSendProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<SendJobData>): Promise<void> {
    await this.emailService.dispatchSend(job.data.emailSendId);
  }
}

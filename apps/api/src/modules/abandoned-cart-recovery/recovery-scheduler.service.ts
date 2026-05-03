import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, type Queue } from 'bullmq';
import { PrismaService } from '../../db/prisma.service';
import { QUEUES } from '../queue/queue.constants';

const SWEEP_PATTERN = '*/5 * * * *'; // every 5 min
const PER_STAGE_LIMIT = 200;

interface ScheduleJobData {
  tenantId: string;
}

interface PrepareJobData {
  tenantId: string;
  abandonedCartId: string;
  stageId: string;
}

/**
 * Phase 3 — automatic recovery scheduler.
 *
 * `onModuleInit` registers a repeatable cron-style BullMQ job on
 * `email.recovery.schedule` per tenant. Each tick (every 5 min) the
 * processor scans every active `EmailCampaign` × active stage and
 * enqueues a `email.recovery.prepare` job for every `AbandonedCart`
 * that:
 *   - belongs to the tenant
 *   - is in status `open`
 *   - has a non-empty `customerEmail`
 *   - was abandoned at least `delayHours` ago
 *   - has NO existing `EmailSend` row for this stage (idempotency)
 *
 * The actual prepare-send + dispatch happen on the
 * `email.recovery.prepare` and `email.send` queues respectively.
 */
@Injectable()
export class RecoverySchedulerService implements OnModuleInit {
  private readonly logger = new Logger(RecoverySchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.emailRecoverySchedule) private readonly scheduleQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true, slug: true } });
    for (const t of tenants) {
      await this.scheduleQueue.add(
        'recovery-sweep',
        { tenantId: t.id } satisfies ScheduleJobData,
        {
          repeat: { pattern: SWEEP_PATTERN },
          jobId: `recovery-schedule:${t.id}`,
          removeOnComplete: { age: 24 * 60 * 60, count: 100 },
          removeOnFail: { age: 7 * 24 * 60 * 60 },
        },
      );
      this.logger.log(`Scheduled recovery sweep (every 5m) for tenant=${t.slug}`);
    }
  }
}

/**
 * Consumer for `email.recovery.schedule` — does the actual scan + enqueue.
 */
@Processor(QUEUES.emailRecoverySchedule, { concurrency: 1 })
@Injectable()
export class RecoverySchedulerProcessor extends WorkerHost {
  private readonly logger = new Logger(RecoverySchedulerProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.emailRecoveryPrepare) private readonly prepareQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ScheduleJobData>): Promise<{ enqueued: number }> {
    const { tenantId } = job.data;

    // Active campaigns × active stages, ordered by earliest delay first
    // (so we send stage 1 before stage 2 if both are due).
    const stages = await this.prisma.emailCampaignStage.findMany({
      where: {
        tenantId,
        isActive: true,
        campaign: { status: 'active' },
      },
      orderBy: [{ campaignId: 'asc' }, { delayHours: 'asc' }],
      select: { id: true, campaignId: true, delayHours: true, position: true },
    });

    if (stages.length === 0) {
      return { enqueued: 0 };
    }

    let enqueued = 0;
    const now = Date.now();

    for (const stage of stages) {
      const cutoff = new Date(now - stage.delayHours * 60 * 60 * 1000);

      // Carts that crossed the delay boundary AND don't have an
      // EmailSend for this stage yet. The NOT EXISTS short-circuits on
      // the unique index `(tenantId, idempotencyKey)` of EmailSend.
      const candidates = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT ac.id
        FROM abandoned_cart ac
        WHERE ac.tenant_id = ${tenantId}::uuid
          AND ac.status = 'open'
          AND ac.customer_email IS NOT NULL
          AND ac.customer_email <> ''
          AND ac.abandoned_at <= ${cutoff}
          AND NOT EXISTS (
            SELECT 1 FROM email_send es
            WHERE es.tenant_id = ${tenantId}::uuid
              AND es.abandoned_cart_id = ac.id
              AND es.stage_id = ${stage.id}::uuid
          )
        ORDER BY ac.abandoned_at ASC
        LIMIT ${PER_STAGE_LIMIT}
      `;

      for (const cart of candidates) {
        const idempotencyKey = `send:${tenantId}:${cart.id}:${stage.id}`;
        await this.prepareQueue.add(
          'prepare-send',
          {
            tenantId,
            abandonedCartId: cart.id,
            stageId: stage.id,
          } satisfies PrepareJobData,
          {
            jobId: idempotencyKey,
            attempts: 5,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
            removeOnFail: { age: 14 * 24 * 60 * 60 },
          },
        );
        enqueued += 1;
      }
    }

    if (enqueued > 0) {
      this.logger.log(
        `Tenant ${tenantId}: enqueued ${enqueued.toString()} prepare-send jobs across ${stages.length.toString()} stage(s)`,
      );
    }
    return { enqueued };
  }
}

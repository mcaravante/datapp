import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, type Queue } from 'bullmq';
import { PrismaService } from '../../db/prisma.service';
import { QUEUES } from '../queue/queue.constants';
import { OrderBackfillService } from './order-backfill.service';

const SCHEDULE_PATTERN = '17 4 * * *'; // 04:17 daily — off-peak, BA local TZ via container

interface BackfillJobData {
  tenantId: string;
}

/**
 * Registers a BullMQ repeatable job per tenant that runs both
 * backfills (region first, fast; shipping second, slow) once a day
 * at 04:17. The CLI runners still exist for ad-hoc / one-off use, but
 * the operator no longer has to remember to run them.
 */
@Injectable()
export class OrderBackfillScheduler implements OnModuleInit {
  private readonly logger = new Logger(OrderBackfillScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.ordersBackfill) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true, slug: true },
    });
    for (const t of tenants) {
      await this.queue.add(
        'orders-backfill-daily',
        { tenantId: t.id } satisfies BackfillJobData,
        {
          repeat: { pattern: SCHEDULE_PATTERN },
          jobId: `orders-backfill:${t.id}`,
          removeOnComplete: { age: 7 * 24 * 60 * 60, count: 30 },
          removeOnFail: { age: 14 * 24 * 60 * 60 },
        },
      );
      this.logger.log(`Scheduled daily backfill (${SCHEDULE_PATTERN}) for tenant=${t.slug}`);
    }
  }
}

@Processor(QUEUES.ordersBackfill, { concurrency: 1 })
@Injectable()
export class OrderBackfillProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderBackfillProcessor.name);

  constructor(private readonly backfill: OrderBackfillService) {
    super();
  }

  async process(job: Job<BackfillJobData>): Promise<{
    region: { pending: number; updated: number };
    shipping: { pending: number; updated: number };
  }> {
    const { tenantId } = job.data;

    // Region first — pure CPU, fast, no external calls. Then shipping
    // — one Magento round-trip per order, slow but rate-limited at
    // the http client layer.
    const region = await this.backfill.backfillRegionForTenant(tenantId);
    if (region.pending > 0) {
      this.logger.log(
        `region backfill tenant=${tenantId} pending=${region.pending.toString()} updated=${region.updated.toString()} stillNull=${region.stillNull.toString()} durationMs=${region.durationMs.toString()}`,
      );
    }

    const shipping = await this.backfill.backfillShippingForStore(tenantId);
    if (shipping.pending > 0) {
      this.logger.log(
        `shipping backfill tenant=${tenantId} pending=${shipping.pending.toString()} updated=${shipping.updated.toString()} stillNull=${shipping.stillNull.toString()} durationMs=${shipping.durationMs.toString()}`,
      );
    }

    return {
      region: { pending: region.pending, updated: region.updated },
      shipping: { pending: shipping.pending, updated: shipping.updated },
    };
  }
}

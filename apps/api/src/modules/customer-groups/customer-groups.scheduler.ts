import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, type Queue } from 'bullmq';
import { PrismaService } from '../../db/prisma.service';
import { QUEUES } from '../queue/queue.constants';
import { CustomerGroupsService } from './customer-groups.service';

// 04:32 daily — keeps the group catalog fresh without competing with
// the order backfill that runs at 04:17 on the same image.
const SCHEDULE_PATTERN = '32 4 * * *';

interface JobData {
  tenantId: string;
}

/**
 * Registers a BullMQ repeatable job per tenant that re-syncs Magento's
 * customer groups every night and links any `customer_profile` rows
 * whose `customer_group` string still resolves to NULL on the FK. The
 * sync is also exposed as `POST /v1/admin/customer-groups/sync` for
 * on-demand use from the admin UI.
 */
@Injectable()
export class CustomerGroupsScheduler implements OnModuleInit {
  private readonly logger = new Logger(CustomerGroupsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.customerGroupsSync) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true, slug: true },
    });
    for (const t of tenants) {
      await this.queue.add(
        'customer-groups-sync-daily',
        { tenantId: t.id } satisfies JobData,
        {
          repeat: { pattern: SCHEDULE_PATTERN },
          jobId: `customer-groups-sync:${t.id}`,
          removeOnComplete: { age: 7 * 24 * 60 * 60, count: 30 },
          removeOnFail: { age: 14 * 24 * 60 * 60 },
        },
      );
      this.logger.log(
        `Scheduled daily customer-groups sync (${SCHEDULE_PATTERN}) for tenant=${t.slug}`,
      );
    }
  }
}

@Processor(QUEUES.customerGroupsSync, { concurrency: 1 })
@Injectable()
export class CustomerGroupsProcessor extends WorkerHost {
  private readonly logger = new Logger(CustomerGroupsProcessor.name);

  constructor(private readonly service: CustomerGroupsService) {
    super();
  }

  async process(job: Job<JobData>): Promise<{
    scanned: number;
    upserted: number;
    profileLinks: number;
  }> {
    const { tenantId } = job.data;
    const report = await this.service.syncForTenant(tenantId);
    return {
      scanned: report.scanned,
      upserted: report.upserted,
      profileLinks: report.profileLinks,
    };
  }
}

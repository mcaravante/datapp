import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Global, Logger, Module, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { QUEUES } from '../queue/queue.constants';
import { PrismaService } from '../../db/prisma.service';
import { RfmProcessor } from './rfm.processor';
import { RfmService } from './rfm.service';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.analyticsRfmNightly })],
  providers: [RfmService, RfmProcessor],
  exports: [RfmService],
})
export class RfmModule implements OnModuleInit {
  private readonly logger = new Logger(RfmModule.name);

  constructor(
    @InjectQueue(QUEUES.analyticsRfmNightly) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Schedule the nightly RFM run for every active tenant on app boot.
   * BullMQ deduplicates repeatable jobs by jobId, so this is idempotent
   * across restarts. Runs at 03:00 UTC = midnight Buenos Aires.
   */
  async onModuleInit(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true, slug: true } });
    for (const t of tenants) {
      await this.queue.add(
        'rfm-nightly',
        { tenantId: t.id },
        {
          repeat: { pattern: '0 3 * * *', tz: 'UTC' },
          jobId: `rfm-nightly:${t.id}`,
          removeOnComplete: { age: 7 * 24 * 60 * 60, count: 30 },
          removeOnFail: { age: 30 * 24 * 60 * 60 },
        },
      );
      this.logger.log(`Scheduled nightly RFM for tenant=${t.slug}`);
    }
  }
}

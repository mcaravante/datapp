import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../db/prisma.service';
import { MagentoModule } from '../magento/magento.module';
import { QUEUES } from '../queue/queue.constants';
import { AbandonedCartSyncProcessor } from './abandoned-cart.processor';
import { AbandonedCartSyncService } from './abandoned-cart-sync.service';
import { CartsController } from './carts.controller';
import { CartsService } from './carts.service';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.cartsAbandonedSync }), MagentoModule],
  controllers: [CartsController],
  providers: [CartsService, AbandonedCartSyncService, AbandonedCartSyncProcessor],
  exports: [CartsService, AbandonedCartSyncService],
})
export class CartsModule implements OnModuleInit {
  private readonly logger = new Logger(CartsModule.name);

  constructor(
    @InjectQueue(QUEUES.cartsAbandonedSync) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Schedule the abandoned-cart sweep every 15 minutes per tenant.
   * BullMQ deduplicates repeatable jobs by jobId so this is idempotent
   * across restarts.
   */
  async onModuleInit(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true, slug: true } });
    for (const t of tenants) {
      await this.queue.add(
        'abandoned-cart-sync',
        { tenantId: t.id },
        {
          repeat: { pattern: '*/15 * * * *' },
          jobId: `abandoned-cart-sync:${t.id}`,
          removeOnComplete: { age: 24 * 60 * 60, count: 100 },
          removeOnFail: { age: 7 * 24 * 60 * 60 },
        },
      );
      this.logger.log(`Scheduled abandoned-cart sync (every 15m) for tenant=${t.slug}`);
    }
  }
}

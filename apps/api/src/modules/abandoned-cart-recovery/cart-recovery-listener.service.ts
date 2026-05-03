import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../db/prisma.service';
import { QUEUES } from '../queue/queue.constants';
import {
  CART_RECOVERED_EVENT,
  type CartRecoveredEvent,
} from './cart-recovery.events';

/**
 * Listens for `cart.recovered` events and cancels in-flight recovery
 * sends. Two operations:
 *   1. Flip every `EmailSend` row for this cart in `pending` status to
 *      `cancelled`. Already-queued / delivered rows are left alone (the
 *      email already went out — point of historical record).
 *   2. Remove the corresponding delayed BullMQ jobs from the
 *      `email.recovery.prepare` and `email.send` queues by their
 *      deterministic jobId.
 */
@Injectable()
export class CartRecoveryListener {
  private readonly logger = new Logger(CartRecoveryListener.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.emailRecoveryPrepare) private readonly prepareQueue: Queue,
    @InjectQueue(QUEUES.emailSend) private readonly sendQueue: Queue,
  ) {}

  @OnEvent(CART_RECOVERED_EVENT, { async: true })
  async onCartRecovered(event: CartRecoveredEvent): Promise<void> {
    const pending = await this.prisma.emailSend.findMany({
      where: {
        tenantId: event.tenantId,
        abandonedCartId: event.abandonedCartId,
        status: 'pending',
      },
      select: { id: true, idempotencyKey: true, stageId: true },
    });

    if (pending.length === 0) return;

    await this.prisma.emailSend.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: {
        status: 'cancelled',
        errorMessage: `Cart recovered before send dispatched (orderId=${event.recoveredByOrderId ?? 'unknown'})`,
      },
    });

    // Best-effort delayed-job removal; ignore individual failures.
    for (const row of pending) {
      try {
        await this.prepareQueue.remove(row.idempotencyKey);
        await this.sendQueue.remove(row.idempotencyKey);
      } catch (err) {
        this.logger.debug(
          `Failed to remove delayed jobs for ${row.idempotencyKey}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Cancelled ${pending.length.toString()} pending recovery send(s) for cart ${event.magentoCartId.toString()}`,
    );
  }
}

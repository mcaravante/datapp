import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { Prisma, type SyncEventType } from '@cdp/db';
import type { IngestEnvelope } from '@cdp/shared/ingest';
import { PrismaService } from '../../db/prisma.service';
import type { ResolvedTenant } from '../tenant/tenant.service';
import type { ResolvedMagentoStore } from '../magento/magento-store.service';
import { QUEUES } from '../queue/queue.constants';

export interface IngestContext {
  tenant: ResolvedTenant;
  store: ResolvedMagentoStore;
}

export interface IngestResult {
  status: 'enqueued' | 'duplicate';
  event_id: string;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.ingestMagentoEvents) private readonly queue: Queue,
  ) {}

  /**
   * Idempotently record a Magento ingest event and enqueue it for async
   * processing. Duplicate `event_id`s short-circuit without enqueuing.
   */
  async ingest(
    ctx: IngestContext,
    envelope: IngestEnvelope,
    rawBody: string,
  ): Promise<IngestResult> {
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');

    try {
      await this.prisma.syncEventLog.create({
        data: {
          tenantId: ctx.tenant.id,
          magentoStoreId: ctx.store.id,
          eventId: envelope.event_id,
          eventType: this.toPrismaEventType(envelope.event_type),
          magentoEntityId: envelope.magento_entity_id,
          payloadHash,
          status: 'pending',
        },
      });
    } catch (err) {
      // Unique violation on event_id → idempotent replay.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.debug(`Duplicate event_id ${envelope.event_id} — no-op`);
        return { status: 'duplicate', event_id: envelope.event_id };
      }
      throw err;
    }

    await this.queue.add(
      envelope.event_type,
      { ctx: { tenantId: ctx.tenant.id, storeId: ctx.store.id }, envelope },
      // Use event_id as job id so BullMQ-level idempotency is enforced too.
      { jobId: envelope.event_id },
    );

    return { status: 'enqueued', event_id: envelope.event_id };
  }

  /** Map the dotted on-the-wire event_type to the Prisma enum value. */
  private toPrismaEventType(t: IngestEnvelope['event_type']): SyncEventType {
    return t.replace('.', '_') as SyncEventType;
  }
}

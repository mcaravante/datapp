import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { IngestEnvelope } from '@datapp/shared/ingest';
import { Prisma, SubscriptionStatus, type SyncEventStatus } from '@datapp/db';
import { QUEUES } from '../queue/queue.constants';
import { PrismaService } from '../../db/prisma.service';
import { MagentoStoreService } from '../magento/magento-store.service';
import { MagentoClientFactory } from '../magento/magento-client.factory';
import { CustomerSyncService } from '../customers/customer-sync.service';
import { OrderSyncService } from '../orders/order-sync.service';

interface JobData {
  ctx: { tenantId: string; storeId: string };
  envelope: IngestEnvelope;
}

interface DispatchOutcome {
  status: SyncEventStatus;
  note?: string;
}

/**
 * BullMQ processor that consumes events the HmacGuard already
 * authenticated and accepted onto `QUEUES.ingestMagentoEvents`. Each
 * event is dispatched by `event_type` to the right sync service:
 *
 *  - customer.{created,updated,logged_in} → re-fetch from Magento
 *    (canonical source of truth for the full payload) + upsert.
 *  - customer.deleted                      → anonymize the local profile.
 *  - order.{created,updated,invoiced,...}  → re-fetch + upsert.
 *  - newsletter.subscribed/unsubscribed/deleted → flip the subscription
 *    columns on the matching customer profile (no Magento round-trip).
 *  - product.{created,updated} + cart.item_added → land in
 *    `sync_event_log` for now (Phase 2 / iter 4 flesh-out).
 *
 * The processor always advances the `sync_event_log` row to a terminal
 * status (processed / failed / skipped). On unexpected failure it
 * re-throws so BullMQ honors the queue's exponential-backoff retry
 * config.
 */
@Processor(QUEUES.ingestMagentoEvents)
export class IngestProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stores: MagentoStoreService,
    private readonly clients: MagentoClientFactory,
    private readonly customers: CustomerSyncService,
    private readonly orders: OrderSyncService,
  ) {
    super();
  }

  async process(job: Job<JobData>): Promise<{ ok: true; status: SyncEventStatus }> {
    const { ctx, envelope } = job.data;
    this.logger.log(
      `event_id=${envelope.event_id} type=${envelope.event_type} entity=${envelope.magento_entity_id}`,
    );

    let outcome: DispatchOutcome;
    try {
      outcome = await this.dispatch(ctx, envelope);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`event_id=${envelope.event_id} failed: ${message}`);
      await this.markEvent(envelope.event_id, 'failed', message.slice(0, 1000));
      throw err; // honor BullMQ retry policy
    }

    await this.markEvent(envelope.event_id, outcome.status, outcome.note ?? null);
    return { ok: true, status: outcome.status };
  }

  private async dispatch(ctx: JobData['ctx'], envelope: IngestEnvelope): Promise<DispatchOutcome> {
    switch (envelope.event_type) {
      case 'customer.created':
      case 'customer.updated':
      case 'customer.logged_in':
        await this.handleCustomerUpsert(ctx, envelope.magento_entity_id);
        return { status: 'processed' };

      case 'customer.deleted':
        await this.handleCustomerDeleted(ctx, envelope.magento_entity_id);
        return { status: 'processed' };

      case 'order.created':
      case 'order.updated':
      case 'order.invoiced':
      case 'order.refunded':
      case 'order.shipped':
        await this.handleOrderUpsert(ctx, envelope.magento_entity_id);
        return { status: 'processed' };

      case 'newsletter.subscribed':
      case 'newsletter.unsubscribed':
      case 'newsletter.deleted':
        await this.handleNewsletter(ctx, envelope);
        return { status: 'processed' };

      case 'product.created':
      case 'product.updated':
      case 'cart.item_added':
        // Persisted in sync_event_log only — Phase 2 / future iter handles them.
        return { status: 'skipped', note: 'no Phase 1 handler' };

      default:
        return { status: 'skipped', note: `unknown event type: ${String(envelope.event_type)}` };
    }
  }

  private async handleCustomerUpsert(ctx: JobData['ctx'], magentoEntityId: string): Promise<void> {
    const id = parseEntityId(magentoEntityId);
    const store = await this.stores.findById(ctx.storeId);
    const client = this.clients.forStore(store);
    const raw = await client.customers.get(id);
    await this.customers.upsert(
      { tenantId: ctx.tenantId, defaultCountry: store.defaultCountry },
      raw,
    );
  }

  private async handleCustomerDeleted(ctx: JobData['ctx'], magentoEntityId: string): Promise<void> {
    const result = await this.prisma.customerProfile.updateMany({
      where: { tenantId: ctx.tenantId, magentoCustomerId: magentoEntityId },
      data: {
        email: `erased+${magentoEntityId}@invalid`,
        emailHash: '0'.repeat(64),
        firstName: null,
        lastName: null,
        phone: null,
        dob: null,
        gender: null,
        attributes: {},
      },
    });
    if (result.count === 0) {
      this.logger.debug(
        `customer.deleted for unknown id=${magentoEntityId} (tenant=${ctx.tenantId}) — no-op`,
      );
    }
  }

  private async handleOrderUpsert(ctx: JobData['ctx'], magentoEntityId: string): Promise<void> {
    const id = parseEntityId(magentoEntityId);
    const store = await this.stores.findById(ctx.storeId);
    const client = this.clients.forStore(store);
    const raw = await client.orders.get(id);
    await this.orders.upsert(
      {
        tenantId: ctx.tenantId,
        magentoStoreId: ctx.storeId,
        defaultCountry: store.defaultCountry,
      },
      raw,
    );
  }

  private async handleNewsletter(ctx: JobData['ctx'], envelope: IngestEnvelope): Promise<void> {
    // Bridge sends newsletter events with the subscriber email + magento
    // status. Magento subscriber statuses: 1 subscribed, 2 unsubscribed,
    // 3 unconfirmed, 4 not active. We collapse into our enum below.
    const payload = envelope.payload as {
      email?: unknown;
      status?: unknown;
      change_status_at?: unknown;
      source?: unknown;
    };
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    if (!email) {
      this.logger.warn(`newsletter event ${envelope.event_id} has no email — skipping`);
      return;
    }

    const status = mapNewsletterStatus(envelope.event_type, payload.status);
    const consentAt =
      typeof payload.change_status_at === 'string' ? safeDate(payload.change_status_at) : null;
    const source = typeof payload.source === 'string' ? payload.source : 'magento.bridge';

    const emailHash = sha256Hex(email);

    await this.prisma.customerProfile.updateMany({
      where: { tenantId: ctx.tenantId, emailHash },
      data: {
        isSubscribed: status === 'subscribed',
        subscriptionStatus: status,
        subscriptionConsentAt: status === 'subscribed' ? (consentAt ?? new Date()) : null,
        subscriptionConsentSource: status === 'subscribed' ? source : null,
      },
    });
  }

  private async markEvent(
    eventId: string,
    status: SyncEventStatus,
    error: string | null,
  ): Promise<void> {
    try {
      await this.prisma.syncEventLog.update({
        where: { eventId },
        data: {
          status,
          error,
          processedAt: new Date(),
        },
      });
    } catch (err) {
      // The row should exist — the HTTP edge inserted it before enqueue.
      // If something deleted it (retention sweep raced the worker?) we
      // log and continue rather than failing the job.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        this.logger.warn(`sync_event_log row missing for event_id=${eventId} — marking skipped`);
        return;
      }
      throw err;
    }
  }
}

function parseEntityId(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid Magento entity id: ${raw}`);
  }
  return n;
}

function mapNewsletterStatus(eventType: string, rawStatus: unknown): SubscriptionStatus {
  if (eventType === 'newsletter.deleted') return SubscriptionStatus.unsubscribed;
  if (eventType === 'newsletter.unsubscribed') return SubscriptionStatus.unsubscribed;
  // newsletter.subscribed: trust Magento's status value if present.
  if (typeof rawStatus === 'number') {
    if (rawStatus === 1) return SubscriptionStatus.subscribed;
    if (rawStatus === 3) return SubscriptionStatus.pending;
  }
  return SubscriptionStatus.subscribed;
}

function sha256Hex(input: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('node:crypto') as typeof import('node:crypto');
  return crypto.createHash('sha256').update(input).digest('hex');
}

function safeDate(s: string): Date | null {
  const d = new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

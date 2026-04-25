import { z } from 'zod';

/**
 * Magento → CDP ingest contract.
 *
 * Mirrors the wire format documented in CLAUDE.md §7. Per-event-type payload
 * shapes are validated downstream in apps/api when the worker dequeues the
 * event; the envelope below is the only thing the HTTP edge needs to trust.
 */

export const IngestEventTypeSchema = z.enum([
  'customer.created',
  'customer.updated',
  'customer.deleted',
  'order.created',
  'order.updated',
  'order.invoiced',
  'order.refunded',
  'order.shipped',
  'product.created',
  'product.updated',
  'newsletter.subscribed',
  'newsletter.unsubscribed',
]);

export type IngestEventType = z.infer<typeof IngestEventTypeSchema>;

/** Envelope sent in the body of `POST /v1/ingest/magento/events`. */
export const IngestEnvelopeSchema = z.object({
  event_id: z.string().uuid(),
  event_type: IngestEventTypeSchema,
  occurred_at: z.string().datetime({ offset: true }),
  magento_entity_id: z.string().min(1),
  payload: z.record(z.unknown()),
});

export type IngestEnvelope = z.infer<typeof IngestEnvelopeSchema>;

/** Headers required by the ingest endpoint (lowercased keys). */
export const IngestHeadersSchema = z.object({
  'x-crm-tenant': z.string().min(2),
  'x-crm-store': z.string().min(1),
  'x-crm-timestamp': z.string().regex(/^\d+$/, 'Unix epoch seconds'),
  'x-crm-signature': z.string().regex(/^[0-9a-f]{64}$/, 'hex(hmac_sha256)'),
  'x-crm-event-id': z.string().uuid(),
});

export type IngestHeaders = z.infer<typeof IngestHeadersSchema>;

/** Maximum age of a webhook (in seconds) accepted by the API. */
export const INGEST_REPLAY_WINDOW_SECONDS = 5 * 60;

/**
 * Single source of truth for BullMQ queue names. Workers in feature
 * modules register `@Processor(QUEUES.x)` against these strings; the API
 * enqueues to the same names.
 *
 * BullMQ disallows `:` in queue names, so we use `.` as the separator.
 */
export const QUEUES = {
  /** Webhook ingest fan-in. Workers dispatch by `event_type` payload. */
  ingestMagentoEvents: 'ingest.magento.events',
  /** CLI / admin-triggered initial bulk syncs, one per entity. */
  syncInitialCustomers: 'sync.initial.customers',
  syncInitialOrders: 'sync.initial.orders',
  syncInitialProducts: 'sync.initial.products',
  /** Nightly drift-detection cron. */
  syncReconciliation: 'sync.reconciliation',
  /** Nightly RFM scoring. */
  analyticsRfmNightly: 'analytics.rfm.nightly',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

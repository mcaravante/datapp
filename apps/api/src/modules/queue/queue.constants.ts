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
  /** Periodic refresh of the abandoned_cart snapshot. */
  cartsAbandonedSync: 'carts.abandoned.sync',
  /** Daily backfill for orders missing shipping_method / region_id —
   *  the live sync sees lite Magento payloads and can leave both NULL.
   *  Idempotent; only touches NULL rows. */
  ordersBackfill: 'orders.backfill',
  /** Daily mirror of Magento `customerGroups` into the CDP, plus
   *  backfill of `customer_profile.customer_group_id` for any rows
   *  whose name still resolves to NULL. */
  customerGroupsSync: 'customer-groups.sync',
  /** Phase 3: scans active campaigns for stages whose `delayHours` has
   *  elapsed and enqueues `emailRecoveryPrepare` jobs. */
  emailRecoverySchedule: 'email.recovery.schedule',
  /** Phase 3: builds an `EmailSend` row (resolves coupon, masked id,
   *  recovery URL, render context) and enqueues `emailSend`. */
  emailRecoveryPrepare: 'email.recovery.prepare',
  /** Phase 3: hands the prepared `EmailSend` row to Resend. */
  emailSend: 'email.send',
  /** Phase 3: processes Resend webhook events (delivered/bounced/...). */
  emailEventsResend: 'email.events.resend',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/**
 * Wire types served by the API. Kept inline for Iteration 3-A; will be
 * extracted to `@datapp/shared` once orders + reports endpoints land and
 * the surface stabilizes.
 */

export interface CustomerListItem {
  id: string;
  magento_customer_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  customer_group: string | null;
  magento_created_at: string | null;
  magento_updated_at: string | null;
  /** Total orders ever placed. Sourced from RFM (≤24h stale). */
  total_orders: number | null;
  /** Lifetime spend (sum of real_revenue) — Decimal as string. */
  total_spent: string | null;
}

export interface CustomerListPage {
  data: CustomerListItem[];
  page: number;
  limit: number;
  total_count: number;
  total_pages: number;
}

export interface CustomerDetail extends CustomerListItem {
  phone: string | null;
  dob: string | null;
  gender: string | null;
  is_subscribed: boolean;
  subscription_status: string;
  attributes: Record<string, unknown>;
  addresses: {
    id: string;
    type: string;
    is_default_billing: boolean;
    is_default_shipping: boolean;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    street1: string | null;
    street2: string | null;
    city: string | null;
    region: { id: number; name: string } | null;
    region_raw: string | null;
    postal_code: string | null;
    country_code: string;
    phone: string | null;
  }[];
  metrics: {
    total_orders: number;
    total_spent: string;
    aov: string;
    first_order_at: string | null;
    last_order_at: string | null;
  };
  rfm: {
    segment: string;
    recency_days: number;
    frequency: number;
    monetary: string;
    recency_score: number;
    frequency_score: number;
    monetary_score: number;
    calculated_at: string;
  } | null;
}

export interface SyncStatusRow {
  entity: 'customers' | 'orders' | 'products' | 'categories' | 'newsletter';
  store: string;
  status: 'idle' | 'running' | 'error' | 'paused';
  last_processed_at: string | null;
  cursor: string | null;
  last_error: string | null;
  updated_at: string;
}

export interface SyncStatusResponse {
  data: SyncStatusRow[];
}

export interface KpiBlock {
  revenue: string;
  orders: number;
  aov: string;
  customers: number;
  new_customers: number;
  returning_customers: number;
  repeat_purchase_rate: number;
}

export interface RevenueTimePoint {
  bucket: string;
  revenue: string;
  orders: number;
}

export interface RevenueTimeseriesResponse {
  range: { from: string; to: string };
  previous_range: { from: string; to: string };
  granularity: 'day' | 'week' | 'month';
  current: RevenueTimePoint[];
  previous: RevenueTimePoint[];
}

export interface AovHistogramBucket {
  min: string;
  max: string;
  orders: number;
}

export interface AovHistogramResponse {
  range: { from: string; to: string };
  total_orders: number;
  median: string;
  buckets: AovHistogramBucket[];
}

export interface YearlyMonthPoint {
  month: number;
  revenue: string;
  orders: number;
}

export interface YearlyRevenueYear {
  year: number;
  total_revenue: string;
  total_orders: number;
  months: YearlyMonthPoint[];
}

export interface YearlyRevenueResponse {
  years: YearlyRevenueYear[];
}

export type BreakdownDimension = 'payment_method' | 'shipping_method';

export interface BreakdownRow {
  key: string;
  orders: number;
  revenue: string;
  share_orders: number;
  share_revenue: number;
}

export interface BreakdownResponse {
  range: { from: string; to: string };
  dimension: BreakdownDimension;
  total_orders: number;
  total_revenue: string;
  data: BreakdownRow[];
}

export interface ExcludedEmailRow {
  id: string;
  email: string;
  reason: string | null;
  added_by: { id: string; email: string; name: string } | null;
  created_at: string;
}

export interface ExcludedEmailsResponse {
  data: ExcludedEmailRow[];
}

export type MethodKind = 'payment' | 'shipping';

export interface MethodLabelRow {
  id: string;
  kind: MethodKind;
  code: string;
  title: string;
  /**
   * When set, the breakdown reports group this row's orders under
   * `merge_into_code` instead of `code`. Used to fold legacy Magento
   * codes (e.g. `mercadopago_basic`) into their renamed canonical
   * (e.g. `mercadopago_adbpayment_checkout_pro`).
   */
  merge_into_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface MethodLabelsResponse {
  data: MethodLabelRow[];
}

export interface KpisResponse {
  range: { from: string; to: string };
  previous_range: { from: string; to: string };
  current: KpiBlock;
  previous: KpiBlock;
  delta: {
    revenue_pct: number | null;
    orders_pct: number | null;
    aov_pct: number | null;
    customers_pct: number | null;
  };
}

export interface TopProductRow {
  sku: string;
  name: string;
  units: number;
  revenue: string;
  orders: number;
}

export type TopProductsSortField = 'revenue' | 'units' | 'orders' | 'sku' | 'name';

export interface TopProductsResponse {
  range: { from: string; to: string };
  sort: TopProductsSortField;
  dir: 'asc' | 'desc';
  data: TopProductRow[];
}

export interface GeoRegionRow {
  region_id: number;
  region_code: string;
  region_name: string;
  customers: number;
  buyers: number;
  orders: number;
  revenue: string;
}

export interface GeoUnmatchedRow {
  region_raw: string | null;
  city_raw: string | null;
  postal_code: string | null;
  occurrences: number;
  last_seen_at: string;
}

export interface GeoResponse {
  range: { from: string; to: string };
  country: string;
  totals: {
    customers: number;
    buyers: number;
    orders: number;
    revenue: string;
  };
  data: GeoRegionRow[];
  unmatched: GeoUnmatchedRow[];
}

export interface OrderListItem {
  id: string;
  magento_order_number: string;
  customer_id: string | null;
  customer_email: string;
  customer_name: string | null;
  status: string;
  state: string;
  currency_code: string;
  grand_total: string;
  real_revenue: string | null;
  coupon_code: string | null;
  item_count: number;
  placed_at: string;
}

export interface CouponRow {
  code: string;
  name: string | null;
  orders: number;
  customers: number;
  gross_revenue: string;
  discount_total: string;
  net_revenue: string;
  first_used_at: string;
  last_used_at: string;
}

export interface CouponsResponse {
  range: { from: string; to: string };
  totals: {
    coupon_orders: number;
    coupon_revenue: string;
    discount_total: string;
    auto_promo_orders: number;
    auto_promo_discount: string;
  };
  data: CouponRow[];
}

export type AbandonedCartStatus = 'open' | 'recovered' | 'expired';
export type AbandonedCartRange = '7d' | '30d' | '90d' | 'all';

export interface AbandonedCartRow {
  /** CDP UUID — used in detail-page URLs and admin actions. */
  id: string;
  cart_id: number;
  customer_id: string | null;
  magento_customer_id: number | null;
  email: string | null;
  customer_name: string | null;
  is_guest: boolean;
  items_count: number;
  items_qty: number;
  subtotal: string;
  grand_total: string;
  currency_code: string | null;
  created_at: string;
  updated_at: string;
  abandoned_at: string;
  status: AbandonedCartStatus;
  recovered_at: string | null;
  recovered_by_order_id: string | null;
  recovered_amount: string | null;
  expired_at: string | null;
  /** Minutes since `abandoned_at` (open) or until recovery (recovered). */
  age_minutes: number;
}

export interface AbandonedCartRecoveryKpis {
  window_days: number;
  carts_open: number;
  carts_recovered: number;
  carts_expired: number;
  recovered_revenue: string;
  open_at_risk: string;
  recovery_rate: number | null;
}

export interface AbandonedCartsResponse {
  generated_at: string;
  status: AbandonedCartStatus;
  range: AbandonedCartRange;
  /** When the cron last touched any row for this tenant (null if never synced). */
  last_synced_at: string | null;
  page: number;
  limit: number;
  total_count: number;
  total_pages: number;
  totals: {
    carts: number;
    items_qty: number;
    grand_total: string;
    recoverable_customers: number;
    recovered_revenue: string;
  };
  kpis: AbandonedCartRecoveryKpis;
  data: AbandonedCartRow[];
}

export interface OrderListPage {
  data: OrderListItem[];
  page: number;
  limit: number;
  total_count: number;
  total_pages: number;
}

export interface OrderItemView {
  id: string;
  sku: string;
  name: string;
  qty_ordered: string;
  qty_invoiced: string;
  qty_refunded: string;
  qty_shipped: string;
  price: string;
  discount_amount: string;
  tax_amount: string;
  row_total: string;
}

export interface OrderHistoryEntry {
  id: string;
  status: string;
  state: string | null;
  comment: string | null;
  created_at: string;
}

export interface HeatmapCell {
  dow: number;
  hour: number;
  orders: number;
  revenue: string;
}

export interface CadenceBucket {
  days_min: number;
  days_max: number | null;
  label: string;
  count: number;
  percent: number;
}

export interface TimingResponse {
  range: { from: string; to: string };
  timezone: string;
  heatmap: HeatmapCell[];
  cadence: {
    repeat_customers: number;
    median_days: number | null;
    buckets: CadenceBucket[];
  };
}

export interface CohortRow {
  cohort_month: string;
  size: number;
  retained: (number | null)[];
}

export interface CohortsResponse {
  timezone: string;
  horizon: number;
  cohorts: CohortRow[];
}

export interface CustomerProductRow {
  sku: string;
  name: string;
  product_id: string | null;
  units: string;
  revenue: string;
  orders: number;
  first_purchased_at: string;
  last_purchased_at: string;
}

export interface CustomerProductsResponse {
  data: CustomerProductRow[];
}

export interface ProductAffinityItem {
  sku: string;
  name: string;
  co_orders: number;
  total_orders: number;
  confidence: number;
  lift: number;
}

export interface ProductAffinityResponse {
  sku: string;
  name: string | null;
  focus_orders: number;
  total_orders: number;
  data: ProductAffinityItem[];
}

export type AdminRole = 'super_admin' | 'admin' | 'analyst' | 'viewer';

export type AdminSection =
  | 'overview'
  | 'customers'
  | 'segments'
  | 'orders'
  | 'carts'
  | 'products'
  | 'coupons'
  | 'regions'
  | 'insights'
  | 'sync';

export type ConfigurableRole = 'analyst' | 'viewer';

export type AccessMatrix = Record<ConfigurableRole, Record<AdminSection, boolean>>;

export interface PermissionsResponse {
  sections: readonly AdminSection[];
  configurable_roles: readonly ConfigurableRole[];
  access: AccessMatrix;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  has_2fa: boolean;
  has_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  tenant_id: string | null;
  has_2fa: boolean;
  must_enable_2fa: boolean;
}

export interface EnrollResponse {
  otpauth_url: string;
  qr_data_url: string;
  manual_entry_secret: string;
}

export interface VerifyTwoFactorResponse {
  recovery_codes: string[];
}

export interface RecoveryCodesResponse {
  recovery_codes: string[];
}

export interface RecoveryCodeCount {
  remaining: number;
}

export type AuditActionId =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'export'
  | 'erase'
  | 'login_failed'
  | 'account_locked'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'session_revoked'
  | 'two_factor_enrolled'
  | 'two_factor_disabled'
  | 'two_factor_admin_reset'
  | 'recovery_codes_generated'
  | 'recovery_code_used';

export interface AuditLogRow {
  id: string;
  at: string;
  action: AuditActionId;
  entity: string;
  entity_id: string | null;
  user: { id: string; email: string; name: string } | null;
  ip: string | null;
  user_agent: string | null;
  after: unknown;
  before: unknown;
}

export interface AuditLogPage {
  data: AuditLogRow[];
  next_cursor: string | null;
}

export interface UsersListResponse {
  data: UserSummary[];
}

export type RfmSegmentLabel =
  | 'champions'
  | 'loyal'
  | 'potential_loyalists'
  | 'new_customers'
  | 'promising'
  | 'needing_attention'
  | 'about_to_sleep'
  | 'at_risk'
  | 'cannot_lose_them'
  | 'hibernating'
  | 'lost';

export interface SegmentDefinition {
  q?: string;
  region_id?: number[];
  customer_group?: string;
  rfm_segment?: RfmSegmentLabel[];
}

export interface SegmentSummary {
  id: string;
  name: string;
  description: string | null;
  definition: SegmentDefinition;
  type: string;
  member_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SegmentsListResponse {
  data: SegmentSummary[];
}

export interface SegmentMemberRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  customer_group: string | null;
  added_at: string;
}

export interface SegmentMembersPage {
  data: SegmentMemberRow[];
  next_cursor: string | null;
}

export interface OrderDetail extends OrderListItem {
  magento_order_id: string;
  subtotal: string;
  total_tax: string;
  shipping_amount: string;
  discount_amount: string;
  total_invoiced: string;
  total_refunded: string;
  total_paid: string;
  total_shipped: string;
  payment_method: string | null;
  shipping_method: string | null;
  discount_description: string | null;
  applied_rule_ids: string | null;
  sku_count: number;
  billing_address: Record<string, unknown>;
  shipping_address: Record<string, unknown>;
  items: OrderItemView[];
  history: OrderHistoryEntry[];
  attributes: Record<string, unknown>;
  magento_updated_at: string;
}


// =====================================================================
// Phase 3 — Email engine (abandoned-cart recovery vertical)
// =====================================================================

export type EmailTemplateChannel = 'abandoned_cart' | 'transactional' | 'marketing';
export type EmailTemplateFormat = 'mjml' | 'html';

export interface EmailTemplateSummary {
  id: string;
  channel: EmailTemplateChannel;
  slug: string;
  name: string;
  subject: string;
  format: EmailTemplateFormat;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplateDetail extends EmailTemplateSummary {
  body_html: string;
  body_text: string | null;
  variables: Record<string, unknown>;
}

export interface EmailTemplatePreviewResponse {
  subject: string;
  html: string;
  text: string | null;
}

export type EmailCampaignStatus = 'draft' | 'active' | 'paused' | 'archived';
export type EmailCampaignTrigger = 'abandoned_cart_stage';
export type CouponMode = 'none' | 'static_code' | 'unique_code';

export interface EmailCampaignStageDto {
  id: string;
  position: number;
  delay_hours: number;
  template_id: string;
  template_slug: string;
  template_name: string;
  coupon_mode: CouponMode;
  coupon_static_code: string | null;
  magento_sales_rule_id: number | null;
  coupon_discount: string | null;
  coupon_discount_type: 'percent' | 'fixed' | null;
  coupon_ttl_hours: number | null;
  is_active: boolean;
}

export interface EmailCampaignSummary {
  id: string;
  slug: string;
  name: string;
  trigger: EmailCampaignTrigger;
  status: EmailCampaignStatus;
  stage_count: number;
  send_count_30d: number;
  created_at: string;
  updated_at: string;
}

export interface EmailCampaignDetail extends EmailCampaignSummary {
  from_email: string | null;
  reply_to_email: string | null;
  archived_at: string | null;
  stages: EmailCampaignStageDto[];
}

export interface SendHistoryRow {
  id: string;
  campaign_id: string;
  campaign_name: string;
  stage_position: number;
  status: string;
  to_email: string;
  subject: string;
  coupon_code: string | null;
  coupon_source: string | null;
  recovery_url: string;
  resend_message_id: string | null;
  last_event_type: string | null;
  last_event_at: string | null;
  scheduled_for: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface SendRecoveryResponse {
  email_send_id: string;
  status: string;
  recovery_url: string;
  coupon_code: string | null;
  resend_message_id: string | null;
  error_message: string | null;
}


export interface BrandingDto {
  tenant_id: string;
  logo_media_asset_id: string | null;
  logo_url: string | null;
  logo_max_width_px: number;
  primary_color: string | null;
  footer_html: string | null;
  sender_name: string | null;
  sender_address: string | null;
  unsubscribe_text: string;
  updated_at: string;
}


export type SuppressionReason = 'manual' | 'hard_bounce' | 'spam_complaint' | 'unsubscribed' | 'invalid_address' | 'test_allowlist';

export interface SuppressionRow {
  id: string;
  email: string;
  reason: SuppressionReason;
  source: string | null;
  notes: string | null;
  created_at: string;
}

export interface SuppressionsListResponse {
  data: SuppressionRow[];
  total: number;
}


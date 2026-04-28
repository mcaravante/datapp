/**
 * Wire types served by the API. Kept inline for Iteration 3-A; will be
 * extracted to `@cdp/shared` once orders + reports endpoints land and
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
}

export interface CustomerListPage {
  data: CustomerListItem[];
  next_cursor: string | null;
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

export interface TopProductsResponse {
  range: { from: string; to: string };
  order_by: 'units' | 'revenue';
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

export interface AbandonedCartRow {
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
  minutes_idle: number;
}

export interface AbandonedCartsResponse {
  generated_at: string;
  threshold_minutes: number;
  totals: {
    carts: number;
    items_qty: number;
    grand_total: string;
    recoverable_customers: number;
  };
  data: AbandonedCartRow[];
}

export interface OrderListPage {
  data: OrderListItem[];
  next_cursor: string | null;
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

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
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

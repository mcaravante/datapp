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

import type { Request } from 'express';
import type { ResolvedMagentoStore } from '../magento/magento-store.service';
import type { ResolvedTenant } from '../tenant/tenant.service';

/** Express request shape after the HmacGuard has run. */
export interface IngestRequest extends Request {
  rawBody?: Buffer;
  ingest: {
    tenant: ResolvedTenant;
    store: ResolvedMagentoStore;
  };
}

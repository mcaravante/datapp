import { z } from 'zod';
import type { MagentoHttpClient } from './http';
import { buildSearchCriteriaParams } from './search-criteria';

/**
 * Magento customer group as returned by `GET /V1/customerGroups/search`.
 * Pupemoda's catalog has ~14 groups (NOT LOGGED IN, General, Wholesale, …).
 * The endpoint is small enough that we always pull all of them in one
 * request — pageSize=200 is a generous ceiling.
 */
const MagentoCustomerGroupSchema = z
  .object({
    id: z.number().int(),
    code: z.string(),
    tax_class_id: z.number().int().nullable().optional(),
    tax_class_name: z.string().nullable().optional(),
  })
  .passthrough();

export type MagentoCustomerGroup = z.infer<typeof MagentoCustomerGroupSchema>;

const SearchResponseSchema = z
  .object({
    items: z.array(MagentoCustomerGroupSchema),
    total_count: z.number().int().optional(),
  })
  .passthrough();

export class MagentoCustomerGroupsResource {
  constructor(private readonly http: MagentoHttpClient) {}

  /**
   * Returns every customer group visible to the integration token.
   * Single request — Magento has no real volume here (handful of rows).
   */
  async listAll(): Promise<MagentoCustomerGroup[]> {
    const params = buildSearchCriteriaParams({
      pageSize: 200,
      currentPage: 1,
    });
    const raw = await this.http.getJson<unknown>('/rest/V1/customerGroups/search', params);
    return SearchResponseSchema.parse(raw).items;
  }
}

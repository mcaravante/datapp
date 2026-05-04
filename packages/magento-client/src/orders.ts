import { z } from 'zod';
import type { MagentoHttpClient } from './http';
import {
  MagentoOrderSchema,
  MagentoSearchResultSchema,
  type MagentoOrder,
  type MagentoSearchResult,
} from './schemas';
import { buildSearchCriteriaParams, type SearchCriteria } from './search-criteria';
import { parseSearchPageTolerant } from './parse-tolerant';

/** Lean shape we ask Magento for when we only care about shipping. */
const ShippingProjectionSchema = z
  .object({
    entity_id: z.number(),
    shipping_method: z.string().nullable().optional(),
    shipping_description: z.string().nullable().optional(),
    extension_attributes: z
      .object({
        shipping_assignments: z
          .array(
            z
              .object({
                shipping: z
                  .object({ method: z.string().nullable().optional() })
                  .passthrough()
                  .optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export interface ShippingProjectionRow {
  entityId: number;
  /** Top-level + extension-attributes coalesced; null when both are blank. */
  method: string | null;
  description: string | null;
}

const SHIPPING_PROJECTION_FIELDS =
  'items[entity_id,shipping_method,shipping_description,extension_attributes[shipping_assignments[shipping[method]]]],total_count';

export class MagentoOrdersResource {
  constructor(private readonly http: MagentoHttpClient) {}

  /** `GET /rest/V1/orders/:id` */
  async get(entityId: number): Promise<MagentoOrder> {
    const raw = await this.http.getJson<unknown>(`/rest/V1/orders/${entityId.toString()}`);
    return MagentoOrderSchema.parse(raw);
  }

  /** `GET /rest/V1/orders?searchCriteria...` (strict — every item must validate). */
  async search(criteria: SearchCriteria): Promise<MagentoSearchResult<MagentoOrder>> {
    const params = buildSearchCriteriaParams(criteria);
    const raw = await this.http.getJson<unknown>('/rest/V1/orders', params);
    return MagentoSearchResultSchema(MagentoOrderSchema).parse(
      raw,
    ) as MagentoSearchResult<MagentoOrder>;
  }

  /**
   * Bulk-fetch shipping method + description for a list of order ids in
   * a SINGLE request. Trims the payload with `fields=` projection — for
   * a 100-id chunk this is ~100x cheaper than calling `get` per id.
   *
   * The caller is responsible for chunking large id lists; URL length is
   * the bottleneck (~8 KB practical limit), so keep chunks ≤ 200.
   */
  async searchShippingByIds(entityIds: number[]): Promise<ShippingProjectionRow[]> {
    if (entityIds.length === 0) return [];
    const params = buildSearchCriteriaParams({
      filterGroups: [
        [{ field: 'entity_id', value: entityIds.join(','), condition_type: 'in' }],
      ],
      pageSize: entityIds.length,
      currentPage: 1,
      fields: SHIPPING_PROJECTION_FIELDS,
    });
    const raw = await this.http.getJson<unknown>('/rest/V1/orders', params);
    const parsed = z
      .object({ items: z.array(ShippingProjectionSchema) })
      .passthrough()
      .parse(raw);
    return parsed.items.map((it) => {
      const top = typeof it.shipping_method === 'string' ? it.shipping_method.trim() : '';
      const fromAssignment =
        it.extension_attributes?.shipping_assignments?.[0]?.shipping?.method;
      const method =
        top.length > 0
          ? top
          : typeof fromAssignment === 'string' && fromAssignment.trim().length > 0
            ? fromAssignment.trim()
            : null;
      const desc =
        typeof it.shipping_description === 'string' && it.shipping_description.trim().length > 0
          ? it.shipping_description.trim()
          : null;
      return { entityId: it.entity_id, method, description: desc };
    });
  }

  /**
   * Iterate every order. Tolerant: malformed rows are warn-logged and
   * skipped instead of killing the sync.
   */
  async *iterate(
    baseCriteria: Omit<SearchCriteria, 'currentPage'>,
  ): AsyncGenerator<MagentoOrder, void, unknown> {
    const pageSize = baseCriteria.pageSize ?? 100;
    let page = 1;
    while (true) {
      const params = buildSearchCriteriaParams({ ...baseCriteria, pageSize, currentPage: page });
      const raw = await this.http.getJson<unknown>('/rest/V1/orders', params);
      const parsed = parseSearchPageTolerant(raw, MagentoOrderSchema, 'orders.iterate');
      for (const order of parsed.items) yield order;
      if (parsed.rawCount < pageSize) return;
      page += 1;
    }
  }
}

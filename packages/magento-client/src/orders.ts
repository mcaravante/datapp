import type { MagentoHttpClient } from './http';
import {
  MagentoOrderSchema,
  MagentoSearchResultSchema,
  type MagentoOrder,
  type MagentoSearchResult,
} from './schemas';
import { buildSearchCriteriaParams, type SearchCriteria } from './search-criteria';
import { parseSearchPageTolerant } from './parse-tolerant';

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

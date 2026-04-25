import type { MagentoHttpClient } from './http.js';
import {
  MagentoOrderSchema,
  MagentoSearchResultSchema,
  type MagentoOrder,
  type MagentoSearchResult,
} from './schemas.js';
import { buildSearchCriteriaParams, type SearchCriteria } from './search-criteria.js';

export class MagentoOrdersResource {
  constructor(private readonly http: MagentoHttpClient) {}

  /** `GET /rest/V1/orders/:id` */
  async get(entityId: number): Promise<MagentoOrder> {
    const raw = await this.http.getJson<unknown>(`/rest/V1/orders/${entityId.toString()}`);
    return MagentoOrderSchema.parse(raw);
  }

  /** `GET /rest/V1/orders?searchCriteria...` */
  async search(criteria: SearchCriteria): Promise<MagentoSearchResult<MagentoOrder>> {
    const params = buildSearchCriteriaParams(criteria);
    const raw = await this.http.getJson<unknown>('/rest/V1/orders', params);
    return MagentoSearchResultSchema(MagentoOrderSchema).parse(
      raw,
    ) as MagentoSearchResult<MagentoOrder>;
  }

  async *iterate(
    baseCriteria: Omit<SearchCriteria, 'currentPage'>,
  ): AsyncGenerator<MagentoOrder, void, unknown> {
    const pageSize = baseCriteria.pageSize ?? 100;
    let page = 1;
    while (true) {
      const result = await this.search({ ...baseCriteria, pageSize, currentPage: page });
      for (const order of result.items) yield order;
      if (result.items.length < pageSize) return;
      page += 1;
    }
  }
}

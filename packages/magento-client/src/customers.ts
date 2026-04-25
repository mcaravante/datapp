import type { MagentoHttpClient } from './http';
import {
  MagentoCustomerSchema,
  MagentoSearchResultSchema,
  type MagentoCustomer,
  type MagentoSearchResult,
} from './schemas';
import { buildSearchCriteriaParams, type SearchCriteria } from './search-criteria';

export class MagentoCustomersResource {
  constructor(private readonly http: MagentoHttpClient) {}

  /** `GET /rest/V1/customers/:id` */
  async get(id: number): Promise<MagentoCustomer> {
    const raw = await this.http.getJson<unknown>(`/rest/V1/customers/${id.toString()}`);
    return MagentoCustomerSchema.parse(raw);
  }

  /** `GET /rest/V1/customers/search?searchCriteria...` */
  async search(criteria: SearchCriteria): Promise<MagentoSearchResult<MagentoCustomer>> {
    const params = buildSearchCriteriaParams(criteria);
    const raw = await this.http.getJson<unknown>('/rest/V1/customers/search', params);
    return MagentoSearchResultSchema(MagentoCustomerSchema).parse(
      raw,
    ) as MagentoSearchResult<MagentoCustomer>;
  }

  /**
   * Iterate every customer matching the given criteria, fetching one page
   * at a time. Resets `currentPage` automatically.
   */
  async *iterate(
    baseCriteria: Omit<SearchCriteria, 'currentPage'>,
  ): AsyncGenerator<MagentoCustomer, void, unknown> {
    const pageSize = baseCriteria.pageSize ?? 100;
    let page = 1;
    while (true) {
      const result = await this.search({ ...baseCriteria, pageSize, currentPage: page });
      for (const customer of result.items) yield customer;
      if (result.items.length < pageSize) return;
      page += 1;
    }
  }
}

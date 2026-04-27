import type { MagentoHttpClient } from './http';
import {
  MagentoCustomerSchema,
  MagentoSearchResultSchema,
  type MagentoCustomer,
  type MagentoSearchResult,
} from './schemas';
import { buildSearchCriteriaParams, type SearchCriteria } from './search-criteria';
import { parseSearchPageTolerant } from './parse-tolerant';

export class MagentoCustomersResource {
  constructor(private readonly http: MagentoHttpClient) {}

  /** `GET /rest/V1/customers/:id` */
  async get(id: number): Promise<MagentoCustomer> {
    const raw = await this.http.getJson<unknown>(`/rest/V1/customers/${id.toString()}`);
    return MagentoCustomerSchema.parse(raw);
  }

  /** `GET /rest/V1/customers/search?searchCriteria...` (strict — every item must validate). */
  async search(criteria: SearchCriteria): Promise<MagentoSearchResult<MagentoCustomer>> {
    const params = buildSearchCriteriaParams(criteria);
    const raw = await this.http.getJson<unknown>('/rest/V1/customers/search', params);
    return MagentoSearchResultSchema(MagentoCustomerSchema).parse(
      raw,
    ) as MagentoSearchResult<MagentoCustomer>;
  }

  /**
   * Iterate every customer matching the given criteria. Tolerant mode:
   * a single malformed row logs a warning and is skipped instead of
   * killing the whole sync. End-of-pagination is detected by the raw
   * item count (not the validated one) so we don't loop forever on a
   * page where every row was bad.
   */
  async *iterate(
    baseCriteria: Omit<SearchCriteria, 'currentPage'>,
  ): AsyncGenerator<MagentoCustomer, void, unknown> {
    const pageSize = baseCriteria.pageSize ?? 100;
    let page = 1;
    while (true) {
      const params = buildSearchCriteriaParams({ ...baseCriteria, pageSize, currentPage: page });
      const raw = await this.http.getJson<unknown>('/rest/V1/customers/search', params);
      const parsed = parseSearchPageTolerant(raw, MagentoCustomerSchema, 'customers.iterate');
      for (const customer of parsed.items) yield customer;
      if (parsed.rawCount < pageSize) return;
      page += 1;
    }
  }
}

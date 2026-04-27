import type { MagentoHttpClient } from './http';
import {
  MagentoProductSchema,
  MagentoSearchResultSchema,
  type MagentoProduct,
  type MagentoSearchResult,
} from './schemas';
import { buildSearchCriteriaParams, type SearchCriteria } from './search-criteria';
import { parseSearchPageTolerant } from './parse-tolerant';

export class MagentoProductsResource {
  constructor(private readonly http: MagentoHttpClient) {}

  /** `GET /rest/V1/products/:sku` (SKU is URL-encoded). */
  async get(sku: string): Promise<MagentoProduct> {
    const raw = await this.http.getJson<unknown>(`/rest/V1/products/${encodeURIComponent(sku)}`);
    return MagentoProductSchema.parse(raw);
  }

  /** `GET /rest/V1/products?searchCriteria...` (strict — every item must validate). */
  async search(criteria: SearchCriteria): Promise<MagentoSearchResult<MagentoProduct>> {
    const params = buildSearchCriteriaParams(criteria);
    const raw = await this.http.getJson<unknown>('/rest/V1/products', params);
    return MagentoSearchResultSchema(MagentoProductSchema).parse(
      raw,
    ) as MagentoSearchResult<MagentoProduct>;
  }

  /**
   * Iterate every product. Tolerant: malformed rows are warn-logged and
   * skipped instead of killing the sync.
   */
  async *iterate(
    baseCriteria: Omit<SearchCriteria, 'currentPage'>,
  ): AsyncGenerator<MagentoProduct, void, unknown> {
    const pageSize = baseCriteria.pageSize ?? 100;
    let page = 1;
    while (true) {
      const params = buildSearchCriteriaParams({ ...baseCriteria, pageSize, currentPage: page });
      const raw = await this.http.getJson<unknown>('/rest/V1/products', params);
      const parsed = parseSearchPageTolerant(raw, MagentoProductSchema, 'products.iterate');
      for (const product of parsed.items) yield product;
      if (parsed.rawCount < pageSize) return;
      page += 1;
    }
  }
}

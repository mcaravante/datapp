import type { MagentoHttpClient } from './http';
import {
  MagentoProductSchema,
  MagentoSearchResultSchema,
  type MagentoProduct,
  type MagentoSearchResult,
} from './schemas';
import { buildSearchCriteriaParams, type SearchCriteria } from './search-criteria';

export class MagentoProductsResource {
  constructor(private readonly http: MagentoHttpClient) {}

  /** `GET /rest/V1/products/:sku` (SKU is URL-encoded). */
  async get(sku: string): Promise<MagentoProduct> {
    const raw = await this.http.getJson<unknown>(`/rest/V1/products/${encodeURIComponent(sku)}`);
    return MagentoProductSchema.parse(raw);
  }

  /** `GET /rest/V1/products?searchCriteria...` */
  async search(criteria: SearchCriteria): Promise<MagentoSearchResult<MagentoProduct>> {
    const params = buildSearchCriteriaParams(criteria);
    const raw = await this.http.getJson<unknown>('/rest/V1/products', params);
    return MagentoSearchResultSchema(MagentoProductSchema).parse(
      raw,
    ) as MagentoSearchResult<MagentoProduct>;
  }

  async *iterate(
    baseCriteria: Omit<SearchCriteria, 'currentPage'>,
  ): AsyncGenerator<MagentoProduct, void, unknown> {
    const pageSize = baseCriteria.pageSize ?? 100;
    let page = 1;
    while (true) {
      const result = await this.search({ ...baseCriteria, pageSize, currentPage: page });
      for (const product of result.items) yield product;
      if (result.items.length < pageSize) return;
      page += 1;
    }
  }
}

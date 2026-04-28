import type { MagentoHttpClient } from './http';
import {
  MagentoCartSchema,
  MagentoSearchResultSchema,
  type MagentoCart,
  type MagentoSearchResult,
} from './schemas';
import { buildSearchCriteriaParams, type SearchCriteria } from './search-criteria';
import { parseSearchPageTolerant } from './parse-tolerant';

export class MagentoCartsResource {
  constructor(private readonly http: MagentoHttpClient) {}

  /** `GET /rest/V1/carts/:id` — single cart (quote) by id. */
  async get(cartId: number): Promise<MagentoCart> {
    const raw = await this.http.getJson<unknown>(`/rest/V1/carts/${cartId.toString()}`);
    return MagentoCartSchema.parse(raw);
  }

  /**
   * `GET /rest/V1/carts/search?searchCriteria...` — strict version. Use
   * for small, validated payloads (admin reports). For long-tail
   * iteration prefer `iterate` (tolerant: skip + warn on bad rows).
   */
  async search(criteria: SearchCriteria): Promise<MagentoSearchResult<MagentoCart>> {
    const params = buildSearchCriteriaParams(criteria);
    const raw = await this.http.getJson<unknown>('/rest/V1/carts/search', params);
    return MagentoSearchResultSchema(MagentoCartSchema).parse(
      raw,
    ) as MagentoSearchResult<MagentoCart>;
  }

  /**
   * Tolerant page iteration. End-of-results detected by the raw item
   * count rather than the validated one so we can't loop forever on a
   * page where every row was malformed.
   */
  async *iterate(
    baseCriteria: Omit<SearchCriteria, 'currentPage'>,
  ): AsyncGenerator<MagentoCart, void, unknown> {
    const pageSize = baseCriteria.pageSize ?? 100;
    let page = 1;
    while (true) {
      const params = buildSearchCriteriaParams({ ...baseCriteria, pageSize, currentPage: page });
      const raw = await this.http.getJson<unknown>('/rest/V1/carts/search', params);
      const parsed = parseSearchPageTolerant(raw, MagentoCartSchema, 'carts.iterate');
      for (const cart of parsed.items) yield cart;
      if (parsed.rawCount < pageSize) return;
      page += 1;
    }
  }
}

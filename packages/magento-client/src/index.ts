import { MagentoHttpClient, type HttpOptions } from './http.js';
import { MagentoCustomersResource } from './customers.js';
import { MagentoOrdersResource } from './orders.js';
import { MagentoProductsResource } from './products.js';
import { MagentoCategoriesResource } from './categories.js';

export type { HttpOptions } from './http.js';
export { MagentoApiError } from './http.js';
export type { SearchCriteria, Filter, SortOrder, ConditionType } from './search-criteria.js';
export type {
  MagentoCustomer,
  MagentoAddress,
  MagentoOrder,
  MagentoOrderItem,
  MagentoStatusHistory,
  MagentoProduct,
  MagentoCategory,
  MagentoSearchResult,
} from './schemas.js';

export interface MagentoClient {
  readonly customers: MagentoCustomersResource;
  readonly orders: MagentoOrdersResource;
  readonly products: MagentoProductsResource;
  readonly categories: MagentoCategoriesResource;
  /** Returns true if the admin token can fetch any customer. */
  ping(): Promise<boolean>;
}

export function createMagentoClient(options: HttpOptions): MagentoClient {
  const http = new MagentoHttpClient(options);
  const customers = new MagentoCustomersResource(http);
  return {
    customers,
    orders: new MagentoOrdersResource(http),
    products: new MagentoProductsResource(http),
    categories: new MagentoCategoriesResource(http),
    async ping(): Promise<boolean> {
      // A 0-result search is the cheapest "is the token alive?" call.
      await customers.search({ pageSize: 1, currentPage: 1 });
      return true;
    },
  };
}

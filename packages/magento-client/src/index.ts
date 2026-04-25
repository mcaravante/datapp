import { MagentoHttpClient, type HttpOptions } from './http';
import { MagentoCustomersResource } from './customers';
import { MagentoOrdersResource } from './orders';
import { MagentoProductsResource } from './products';
import { MagentoCategoriesResource } from './categories';

export type { HttpOptions } from './http';
export { MagentoApiError } from './http';
export type { SearchCriteria, Filter, SortOrder, ConditionType } from './search-criteria';
export type {
  MagentoCustomer,
  MagentoAddress,
  MagentoOrder,
  MagentoOrderItem,
  MagentoStatusHistory,
  MagentoProduct,
  MagentoCategory,
  MagentoSearchResult,
} from './schemas';

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

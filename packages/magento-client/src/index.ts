/**
 * @cdp/magento-client — typed Magento 2 REST API client.
 *
 * STATUS: stub. Real implementation lands in Iteration 2 with:
 *  - `customers.get(id)` / `customers.search(criteria)`
 *  - `orders.get(id)`    / `orders.search(criteria)`
 *  - `products.get(sku)` / `products.search(criteria)`
 *  - `categories.list()`
 *  - p-retry exponential backoff, circuit breaker on 5xx/timeout
 *  - configurable rate limit (Magento default: 4 rps)
 *
 * The package exists now so the dependency graph is established and other
 * packages can import its (empty) types without churning their deps later.
 */

export const MAGENTO_CLIENT_VERSION = '0.0.0';

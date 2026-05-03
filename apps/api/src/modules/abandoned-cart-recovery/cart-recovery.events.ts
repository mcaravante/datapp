/**
 * Domain events emitted by the carts module and consumed by the
 * abandoned-cart-recovery module. Decouples the cart sync from the
 * recovery vertical so the engine can stay opt-in.
 */

export const CART_RECOVERED_EVENT = 'cart.recovered' as const;

export interface CartRecoveredEvent {
  tenantId: string;
  abandonedCartId: string;
  /** Magento quote/cart id — handy for log lines. */
  magentoCartId: number;
  /** Order id that triggered the recovery flip, when known. */
  recoveredByOrderId: string | null;
  recoveredAt: Date;
}

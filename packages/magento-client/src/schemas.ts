import { z } from 'zod';

/**
 * Zod schemas for Magento 2 REST responses. Each schema uses
 * `.passthrough()` so we tolerate the long tail of attributes the
 * application doesn't read directly — those land in the `attributes`
 * JSONB column on our side.
 *
 * Keep these schemas conservative: only the fields we actually consume
 * are validated strictly. Anything else is opaque.
 */

const CustomAttributeSchema = z
  .object({
    attribute_code: z.string(),
    value: z.union([z.string(), z.number(), z.array(z.string()), z.array(z.number())]).nullable(),
  })
  .passthrough();

export const MagentoAddressSchema = z
  .object({
    id: z.number().optional(),
    customer_id: z.number().optional(),
    region: z
      .object({
        region: z.string().nullable().optional(),
        region_code: z.string().nullable().optional(),
        region_id: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    region_id: z.number().nullable().optional(),
    country_id: z.string().length(2).optional(),
    street: z.array(z.string()).optional(),
    company: z.string().nullable().optional(),
    telephone: z.string().nullable().optional(),
    postcode: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    firstname: z.string().nullable().optional(),
    lastname: z.string().nullable().optional(),
    default_shipping: z.boolean().optional(),
    default_billing: z.boolean().optional(),
  })
  .passthrough();
export type MagentoAddress = z.infer<typeof MagentoAddressSchema>;

export const MagentoCustomerSchema = z
  .object({
    id: z.number(),
    email: z.string().email(),
    firstname: z.string().nullable().optional(),
    lastname: z.string().nullable().optional(),
    middlename: z.string().nullable().optional(),
    gender: z.number().nullable().optional(), // Magento: 1 male, 2 female, 3 not specified
    dob: z.string().nullable().optional(), // YYYY-MM-DD
    group_id: z.number().optional(),
    store_id: z.number().optional(),
    website_id: z.number().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    default_billing: z.string().nullable().optional(), // Magento returns this as the address ID (string)
    default_shipping: z.string().nullable().optional(),
    addresses: z.array(MagentoAddressSchema).optional(),
    custom_attributes: z.array(CustomAttributeSchema).optional(),
    extension_attributes: z.record(z.unknown()).optional(),
  })
  .passthrough();
export type MagentoCustomer = z.infer<typeof MagentoCustomerSchema>;

export const MagentoOrderItemSchema = z
  .object({
    item_id: z.number(),
    sku: z.string(),
    name: z.string(),
    product_id: z.number().optional(),
    qty_ordered: z.number(),
    qty_invoiced: z.number().optional(),
    qty_refunded: z.number().optional(),
    qty_shipped: z.number().optional(),
    price: z.number(),
    discount_amount: z.number().optional(),
    tax_amount: z.number().optional(),
    row_total: z.number(),
    product_type: z.string().optional(),
    product_option: z.unknown().optional(),
  })
  .passthrough();
export type MagentoOrderItem = z.infer<typeof MagentoOrderItemSchema>;

export const MagentoStatusHistorySchema = z
  .object({
    entity_id: z.number(),
    parent_id: z.number().optional(),
    status: z.string(),
    comment: z.string().nullable().optional(),
    created_at: z.string(),
  })
  .passthrough();
export type MagentoStatusHistory = z.infer<typeof MagentoStatusHistorySchema>;

export const MagentoOrderSchema = z
  .object({
    entity_id: z.number(),
    increment_id: z.string(),
    customer_id: z.number().nullable().optional(),
    customer_email: z.string(),
    customer_is_guest: z.number().optional(),
    status: z.string(),
    state: z.string(),
    base_currency_code: z.string().length(3).optional(),
    order_currency_code: z.string().length(3),
    subtotal: z.number(),
    tax_amount: z.number().optional(),
    shipping_amount: z.number().optional(),
    discount_amount: z.number().optional(),
    grand_total: z.number(),
    total_invoiced: z.number().nullable().optional(),
    total_refunded: z.number().nullable().optional(),
    total_paid: z.number().nullable().optional(),
    total_due: z.number().nullable().optional(),
    items: z.array(MagentoOrderItemSchema),
    payment: z
      .object({
        method: z.string(),
      })
      .passthrough()
      .optional(),
    shipping_method: z.string().nullable().optional(),
    billing_address: MagentoAddressSchema.optional(),
    extension_attributes: z
      .object({
        shipping_assignments: z
          .array(
            z
              .object({
                shipping: z
                  .object({
                    address: MagentoAddressSchema.optional(),
                    method: z.string().optional(),
                  })
                  .passthrough(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
    status_histories: z.array(MagentoStatusHistorySchema).optional(),
    created_at: z.string(),
    updated_at: z.string(),
    remote_ip: z.string().nullable().optional(),
    x_forwarded_for: z.string().nullable().optional(),
  })
  .passthrough();
export type MagentoOrder = z.infer<typeof MagentoOrderSchema>;

export const MagentoProductSchema = z
  .object({
    id: z.number(),
    sku: z.string(),
    name: z.string(),
    type_id: z.string(),
    status: z.number(), // 1=enabled, 2=disabled
    visibility: z.number(), // 1=not_visible, 2=catalog, 3=search, 4=catalog_search
    price: z.number().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    custom_attributes: z.array(CustomAttributeSchema).optional(),
    media_gallery_entries: z
      .array(
        z
          .object({
            file: z.string(),
            url: z.string().optional(),
            position: z.number().optional(),
            types: z.array(z.string()).optional(),
          })
          .passthrough(),
      )
      .optional(),
    extension_attributes: z
      .object({
        category_links: z
          .array(
            z
              .object({
                category_id: z.string(),
                position: z.number().optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type MagentoProduct = z.infer<typeof MagentoProductSchema>;

export const MagentoCategorySchema: z.ZodType<MagentoCategory> = z.lazy(() =>
  z
    .object({
      id: z.number(),
      parent_id: z.number().optional(),
      name: z.string(),
      is_active: z.boolean().optional(),
      position: z.number().optional(),
      level: z.number().optional(),
      product_count: z.number().optional(),
      children_data: z.array(MagentoCategorySchema).optional(),
    })
    .passthrough(),
);

export interface MagentoCategory {
  id: number;
  name: string;
  parent_id?: number | undefined;
  is_active?: boolean | undefined;
  position?: number | undefined;
  level?: number | undefined;
  product_count?: number | undefined;
  children_data?: MagentoCategory[] | undefined;
  [key: string]: unknown;
}

export const MagentoSearchResultSchema = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({
      items: z.array(item),
      search_criteria: z.unknown().optional(),
      total_count: z.number(),
    })
    .passthrough();

export type MagentoSearchResult<T> = {
  items: T[];
  total_count: number;
};

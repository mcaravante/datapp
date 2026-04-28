import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@cdp/db';
import { PrismaService } from '../../db/prisma.service';

export interface GdprExportPayload {
  exported_at: string;
  customer: Record<string, unknown>;
  addresses: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  rfm: Record<string, unknown> | null;
  rfm_history: Record<string, unknown>[];
  subscriptions: Record<string, unknown>[];
}

export interface GdprEraseResult {
  customer_id: string;
  pseudonym_email: string;
  orders_pseudonymized: number;
  addresses_scrubbed: number;
}

@Injectable()
export class GdprService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Full PII dump for a customer. Audit-logged with `action=export`.
   * Returns everything the CDP holds about the person — profile,
   * addresses, every order with items + status history, RFM scores,
   * subscriptions. Phase 2/3 tables (web events, form submissions,
   * subscriptions) are included but mostly empty in Phase 1.
   */
  async export(
    tenantId: string,
    customerId: string,
    actor: { id: string; ip?: string | null; userAgent?: string | null },
  ): Promise<GdprExportPayload> {
    const profile = await this.prisma.customerProfile.findFirst({
      where: { id: customerId, tenantId },
      include: {
        addresses: { include: { region: true } },
        orders: {
          orderBy: { placedAt: 'desc' },
          include: { items: true, history: { orderBy: { createdAt: 'desc' } } },
        },
        rfmScore: true,
        rfmHistory: { orderBy: { calculatedAt: 'desc' } },
        subscriptions: true,
      },
    });
    if (!profile) throw new NotFoundException(`Customer ${customerId} not found`);

    const payload: GdprExportPayload = {
      exported_at: new Date().toISOString(),
      customer: serializeCustomer(profile),
      addresses: profile.addresses.map(serializeAddress),
      orders: profile.orders.map(serializeOrder),
      rfm: profile.rfmScore ? serializeRfm(profile.rfmScore) : null,
      rfm_history: profile.rfmHistory.map(serializeRfm),
      subscriptions: profile.subscriptions.map(serializeRecord),
    };

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: actor.id,
        action: 'export',
        entity: 'customer_profile',
        entityId: customerId,
        ip: actor.ip ?? null,
        userAgent: actor.userAgent ?? null,
        // Don't log full PII in `before`/`after` — just a summary so we
        // know an export happened and can audit the volume.
        after: {
          orders: profile.orders.length,
          addresses: profile.addresses.length,
          rfm_history: profile.rfmHistory.length,
        },
      },
    });

    return payload;
  }

  /**
   * Pseudonymize a customer in place. Drops PII (email, name, phone,
   * dob, gender, address detail, order email) but preserves analytics
   * aggregates: orders, items, totals, region/country on addresses,
   * RFM scores. Idempotent: re-erasing returns the same pseudonym.
   *
   * The original `email_hash` (sha256 of the lowercased original email)
   * is preserved so we can still detect duplicate erasure requests
   * from the same person without storing their email.
   */
  async erase(
    tenantId: string,
    customerId: string,
    actor: { id: string; ip?: string | null; userAgent?: string | null },
  ): Promise<GdprEraseResult> {
    const existing = await this.prisma.customerProfile.findFirst({
      where: { id: customerId, tenantId },
      include: { addresses: true },
    });
    if (!existing) throw new NotFoundException(`Customer ${customerId} not found`);

    const pseudonymEmail = `erased+${customerId.slice(0, 8)}@erased.local`;
    const ORDER_EMAIL = 'erased@erased.local';

    const result = await this.prisma.$transaction(async (tx) => {
      const profileBefore = serializeCustomer(existing);

      await tx.customerProfile.update({
        where: { id: customerId },
        data: {
          email: pseudonymEmail,
          firstName: null,
          lastName: null,
          phone: null,
          dob: null,
          gender: null,
          attributes: {},
          isSubscribed: false,
          subscriptionStatus: 'unsubscribed',
          subscriptionConsentAt: null,
          subscriptionConsentSource: null,
        },
      });

      // Scrub address text fields. We KEEP regionId / countryCode / city
      // because the geo report uses them and they alone are not PII.
      const addressUpdate = await tx.customerAddress.updateMany({
        where: { customerProfileId: customerId, tenantId },
        data: {
          firstName: null,
          lastName: null,
          company: null,
          street1: null,
          street2: null,
          postalCode: null,
          phone: null,
        },
      });

      const orderUpdate = await tx.order.updateMany({
        where: { customerProfileId: customerId, tenantId },
        data: {
          customerEmail: ORDER_EMAIL,
          billingAddress: {},
          shippingAddress: {},
          ipAddress: null,
          userAgent: null,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.id,
          action: 'erase',
          entity: 'customer_profile',
          entityId: customerId,
          ip: actor.ip ?? null,
          userAgent: actor.userAgent ?? null,
          before: profileBefore as unknown as Prisma.InputJsonValue,
          after: {
            email: pseudonymEmail,
            orders_pseudonymized: orderUpdate.count,
            addresses_scrubbed: addressUpdate.count,
          },
        },
      });

      return {
        customer_id: customerId,
        pseudonym_email: pseudonymEmail,
        orders_pseudonymized: orderUpdate.count,
        addresses_scrubbed: addressUpdate.count,
      };
    });

    return result;
  }
}

// ─── Serializers ────────────────────────────────────────────────────────────

type ProfileBase = Prisma.CustomerProfileGetPayload<true>;
type AddressWithRegion = Prisma.CustomerAddressGetPayload<{ include: { region: true } }>;

function serializeCustomer(profile: ProfileBase): Record<string, unknown> {
  return {
    id: profile.id,
    magento_customer_id: profile.magentoCustomerId,
    email: profile.email,
    email_hash: profile.emailHash,
    first_name: profile.firstName,
    last_name: profile.lastName,
    phone: profile.phone,
    dob: profile.dob ? profile.dob.toISOString().slice(0, 10) : null,
    gender: profile.gender,
    customer_group: profile.customerGroup,
    is_subscribed: profile.isSubscribed,
    subscription_status: profile.subscriptionStatus,
    attributes: profile.attributes,
    magento_created_at: profile.magentoCreatedAt?.toISOString() ?? null,
    magento_updated_at: profile.magentoUpdatedAt?.toISOString() ?? null,
    created_at: profile.createdAt.toISOString(),
    updated_at: profile.updatedAt.toISOString(),
  };
}

function serializeAddress(address: AddressWithRegion): Record<string, unknown> {
  return {
    id: address.id,
    type: address.type,
    is_default_billing: address.isDefaultBilling,
    is_default_shipping: address.isDefaultShipping,
    first_name: address.firstName,
    last_name: address.lastName,
    company: address.company,
    street1: address.street1,
    street2: address.street2,
    city: address.city,
    region: address.region ? { id: address.region.id, name: address.region.name } : null,
    region_raw: address.regionRaw,
    postal_code: address.postalCode,
    country_code: address.countryCode,
    phone: address.phone,
  };
}

function serializeOrder(
  order: Prisma.OrderGetPayload<{ include: { items: true; history: true } }>,
): Record<string, unknown> {
  return {
    id: order.id,
    magento_order_number: order.magentoOrderNumber,
    status: order.status,
    state: order.state,
    placed_at: order.placedAt.toISOString(),
    currency_code: order.currencyCode,
    grand_total: order.grandTotal.toString(),
    real_revenue: order.realRevenue ? order.realRevenue.toString() : null,
    billing_address: order.billingAddress,
    shipping_address: order.shippingAddress,
    items: order.items.map((i) => ({
      sku: i.sku,
      name: i.name,
      qty_ordered: i.qtyOrdered.toString(),
      row_total: i.rowTotal.toString(),
    })),
    history: order.history.map((h) => ({
      status: h.status,
      state: h.state,
      comment: h.comment,
      created_at: h.createdAt.toISOString(),
    })),
  };
}

function serializeRfm(rfm: { [key: string]: unknown }): Record<string, unknown> {
  return serializeRecord(rfm);
}

function serializeRecord(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === 'object' && v !== null && 'toString' in v && 'cmp' in v) {
      // Prisma.Decimal — preserve precision as string.
      out[k] = v.toString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

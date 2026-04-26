import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@cdp/db';
import type { MagentoOrder } from '@cdp/magento-client';
import { PrismaService } from '../../db/prisma.service';
import { mapOrder, type MappedOrder, type MappedOrderItem } from './order-mapper';

export interface OrderSyncContext {
  tenantId: string;
  magentoStoreId: string;
}

@Injectable()
export class OrderSyncService {
  private readonly logger = new Logger(OrderSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent upsert of one Magento order. Items + status history are
   * replaced wholesale (Magento is canonical). Customer link is resolved
   * from the existing `customer_profile` row by `(tenantId,
   * magentoCustomerId)`; if the customer hasn't been synced yet, the
   * order is persisted with `customerProfileId = null` and the row will
   * be relinked on a subsequent customer sync.
   */
  async upsert(
    ctx: OrderSyncContext,
    raw: MagentoOrder,
  ): Promise<{ id: string; created: boolean }> {
    const m = mapOrder(raw);

    return this.prisma.$transaction(async (tx) => {
      // Resolve the customer FK with two fallbacks so order sync is resilient
      // to operation order: try Magento customer id first (most precise),
      // then fall back to email hash (catches partial-customer-sync cases
      // and the rare guest-checkout-with-existing-account combo).
      let customerProfileId: string | null = null;
      if (m.magentoCustomerId) {
        const byId = await tx.customerProfile.findUnique({
          where: {
            tenantId_magentoCustomerId: {
              tenantId: ctx.tenantId,
              magentoCustomerId: m.magentoCustomerId,
            },
          },
          select: { id: true },
        });
        customerProfileId = byId?.id ?? null;
      }
      if (!customerProfileId) {
        const byEmail = await tx.customerProfile.findFirst({
          where: { tenantId: ctx.tenantId, emailHash: m.customerEmailHash },
          select: { id: true },
        });
        customerProfileId = byEmail?.id ?? null;
      }

      const existing = await tx.order.findUnique({
        where: {
          tenantId_magentoStoreId_magentoOrderId: {
            tenantId: ctx.tenantId,
            magentoStoreId: ctx.magentoStoreId,
            magentoOrderId: m.magentoOrderId,
          },
        },
        select: { id: true },
      });

      const order = existing
        ? await tx.order.update({
            where: { id: existing.id },
            data: orderUpdateData(m, customerProfileId),
            select: { id: true },
          })
        : await tx.order.create({
            data: orderCreateData(m, ctx, customerProfileId),
            select: { id: true },
          });

      // Replace items + history wholesale.
      await tx.orderItem.deleteMany({ where: { orderId: order.id } });
      if (m.items.length > 0) {
        await tx.orderItem.createMany({
          data: m.items.map((i) => itemCreateData(i, order.id, ctx.tenantId)),
        });
      }

      await tx.orderStatusHistory.deleteMany({ where: { orderId: order.id } });
      if (m.statusHistory.length > 0) {
        await tx.orderStatusHistory.createMany({
          data: m.statusHistory.map((h) => ({
            orderId: order.id,
            status: h.status,
            state: h.state,
            comment: h.comment,
            createdAt: h.createdAt,
          })),
        });
      }

      return { id: order.id, created: !existing };
    });
  }
}

function orderCreateData(
  m: MappedOrder,
  ctx: OrderSyncContext,
  customerProfileId: string | null,
): Prisma.OrderUncheckedCreateInput {
  return {
    tenantId: ctx.tenantId,
    magentoStoreId: ctx.magentoStoreId,
    magentoOrderId: m.magentoOrderId,
    magentoOrderNumber: m.magentoOrderNumber,
    customerProfileId,
    customerEmail: m.customerEmail,
    customerEmailHash: m.customerEmailHash,
    status: m.status,
    state: m.state,
    currencyCode: m.currencyCode,
    subtotal: m.subtotal,
    totalTax: m.totalTax,
    shippingAmount: m.shippingAmount,
    discountAmount: m.discountAmount,
    grandTotal: m.grandTotal,
    totalInvoiced: m.totalInvoiced,
    totalRefunded: m.totalRefunded,
    totalPaid: m.totalPaid,
    totalShipped: m.totalShipped,
    billingAddress: m.billingAddress as Prisma.InputJsonValue,
    shippingAddress: m.shippingAddress as Prisma.InputJsonValue,
    paymentMethod: m.paymentMethod,
    shippingMethod: m.shippingMethod,
    itemCount: m.itemCount,
    skuCount: m.skuCount,
    ipAddress: m.ipAddress,
    userAgent: m.userAgent,
    placedAt: m.placedAt,
    magentoUpdatedAt: m.magentoUpdatedAt,
    attributes: m.attributes as Prisma.InputJsonValue,
  };
}

function orderUpdateData(
  m: MappedOrder,
  customerProfileId: string | null,
): Prisma.OrderUncheckedUpdateInput {
  return {
    magentoOrderNumber: m.magentoOrderNumber,
    customerProfileId,
    customerEmail: m.customerEmail,
    customerEmailHash: m.customerEmailHash,
    status: m.status,
    state: m.state,
    currencyCode: m.currencyCode,
    subtotal: m.subtotal,
    totalTax: m.totalTax,
    shippingAmount: m.shippingAmount,
    discountAmount: m.discountAmount,
    grandTotal: m.grandTotal,
    totalInvoiced: m.totalInvoiced,
    totalRefunded: m.totalRefunded,
    totalPaid: m.totalPaid,
    totalShipped: m.totalShipped,
    billingAddress: m.billingAddress as Prisma.InputJsonValue,
    shippingAddress: m.shippingAddress as Prisma.InputJsonValue,
    paymentMethod: m.paymentMethod,
    shippingMethod: m.shippingMethod,
    itemCount: m.itemCount,
    skuCount: m.skuCount,
    ipAddress: m.ipAddress,
    userAgent: m.userAgent,
    placedAt: m.placedAt,
    magentoUpdatedAt: m.magentoUpdatedAt,
    attributes: m.attributes as Prisma.InputJsonValue,
  };
}

function itemCreateData(
  i: MappedOrderItem,
  orderId: string,
  tenantId: string,
): Prisma.OrderItemCreateManyInput {
  return {
    tenantId,
    orderId,
    magentoOrderItemId: i.magentoOrderItemId,
    sku: i.sku,
    name: i.name,
    qtyOrdered: i.qtyOrdered,
    qtyInvoiced: i.qtyInvoiced,
    qtyRefunded: i.qtyRefunded,
    qtyShipped: i.qtyShipped,
    price: i.price,
    discountAmount: i.discountAmount,
    taxAmount: i.taxAmount,
    rowTotal: i.rowTotal,
    attributes: i.attributes as Prisma.InputJsonValue,
  };
}

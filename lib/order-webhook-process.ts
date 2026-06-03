import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";
import { prisma } from "@/lib/prisma";
import { syncContactMasterFromShopifyOrder } from "@/lib/contact-master-sync";
import { LIMITS } from "@/lib/validation";
import { ensureCustomerAndLink } from "@/lib/order-customers";
import { resolveAssignedMerchant } from "@/lib/order-assignment";
import { ensureProductItemAndCreateLineItem } from "@/lib/order-line-items";
import { sendOrderSms } from "@/lib/order-sms";
import { syncOrderToERPNext, cancelErpnextSalesInvoice, type LocationWithErpInstance } from "@/lib/erpnext-sync";
import { isOrderPaymentRequiresApproval, createOrGetOrderPaymentApproval } from "@/lib/approval-workflow";

function parseDecimal(value: string | null | undefined): Decimal | null {
  if (value == null || value === "") return null;
  const num = parseFloat(value);
  return Number.isNaN(num) ? null : new Decimal(value);
}

function normalizePaymentGateways(raw: string[] | undefined): {
  names: string[];
  primary: string | null;
} {
  const maxLen = LIMITS.paymentGatewayName.max;
  const maxItems = 20;
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of raw ?? []) {
    if (typeof item !== "string") continue;
    const s = item.trim().slice(0, maxLen);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    names.push(s);
    if (names.length >= maxItems) break;
  }
  return { names, primary: names[0] ?? null };
}

function getShopifyOrderCreatedAt(order: ShopifyOrderWebhookPayload) {
  const parsed = order.created_at ? new Date(order.created_at) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

export async function processOrderWebhook(
  data: ShopifyOrderWebhookPayload,
  location: LocationWithErpInstance,
  rawPayload: unknown
): Promise<void> {
  const existingOrder = await prisma.order.findUnique({
    where: { shopifyOrderId: String(data.id) },
    select: {
      id: true,
      invoiceCompleteAt: true,
      companyLocationId: true,
      erpnextInvoiceId: true,
    },
  });
  let effectiveLocation: LocationWithErpInstance = location;
  if (existingOrder && existingOrder.companyLocationId !== location.id) {
    const persistedLocation = await prisma.companyLocation.findUnique({
      where: { id: existingOrder.companyLocationId },
      include: { erpnextInstance: true },
    });
    if (persistedLocation) {
      effectiveLocation = persistedLocation;
      console.warn("[Order webhook] Preserving original order location", {
        shopifyOrderId: String(data.id),
        incomingLocationId: location.id,
        preservedLocationId: persistedLocation.id,
        incomingShopifyLocationId: location.shopifyLocationId,
        preservedShopifyLocationId: persistedLocation.shopifyLocationId,
      });
    }
  }

  const companyId = effectiveLocation.companyId;
  const isNewOrder = !existingOrder;

  const customerId = await ensureCustomerAndLink(data, companyId, isNewOrder);
  const assignedMerchantId = await resolveAssignedMerchant(data, effectiveLocation);

  const sourceName = (data.source_name ?? "web").trim().slice(0, 20) || "web";
  const totalPrice = parseDecimal(data.total_price) ?? new Decimal(0);
  const subtotalPrice = parseDecimal(
    data.subtotal_price ?? data.current_subtotal_price
  );
  const totalDiscounts = parseDecimal(
    data.total_discounts ?? data.current_total_discounts
  );
  const totalTax = parseDecimal(data.total_tax ?? data.current_total_tax);
  const orderCreatedAt = getShopifyOrderCreatedAt(data);

  let totalShipping: Decimal | null = null;
  if (data.shipping_lines && data.shipping_lines.length > 0) {
    const sum = data.shipping_lines.reduce(
      (acc, line) =>
        acc + parseFloat(line.price ?? line.discounted_price ?? "0"),
      0
    );
    totalShipping = new Decimal(sum);
  }

  const customerEmail =
    data.contact_email ?? data.email ?? data.customer?.email ?? null;
  const customerPhone = data.phone ?? data.customer?.phone ?? null;
  const paymentGateways = normalizePaymentGateways(data.payment_gateway_names);

  const orderData = {
    companyId,
    companyLocationId: effectiveLocation.id,
    assignedMerchantId,
    customerId,
    shopifyOrderId: String(data.id),
    sourceName,
    shopifyUserId: data.user_id != null ? String(data.user_id) : null,
    orderNumber: data.order_number != null ? String(data.order_number) : null,
    name: data.name?.slice(0, 100) ?? null,
    totalPrice,
    subtotalPrice,
    totalDiscounts,
    totalTax,
    totalShipping,
    currency: data.currency?.slice(0, 10) ?? null,
    financialStatus: data.financial_status?.slice(0, 50) ?? null,
    fulfillmentStatus: data.fulfillment_status?.slice(0, 50) ?? null,
    paymentGatewayNames: paymentGateways.names,
    paymentGatewayPrimary: paymentGateways.primary,
    createdAt: orderCreatedAt,
    customerEmail: customerEmail?.slice(0, LIMITS.email.max) ?? null,
    customerPhone: customerPhone?.slice(0, LIMITS.mobile.max) ?? null,
    shippingAddress: data.shipping_address
      ? (data.shipping_address as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    billingAddress: data.billing_address
      ? (data.billing_address as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    discountCodes:
      data.discount_codes && data.discount_codes.length > 0
        ? (data.discount_codes as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    discountApplications:
      data.discount_applications && data.discount_applications.length > 0
        ? (data.discount_applications as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    shippingLines:
      data.shipping_lines && data.shipping_lines.length > 0
        ? (data.shipping_lines as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    rawPayload: rawPayload as Prisma.InputJsonValue,
  };

  const isPaid = data.financial_status?.toLowerCase() === "paid";

  const order = await prisma.order.upsert({
    where: { shopifyOrderId: String(data.id) },
    create: {
      ...orderData,
      ...(isPaid && {
        invoiceCompleteAt: orderCreatedAt,
      }),
    },
    update: {
      ...orderData,
      ...(isPaid && {
        invoiceCompleteAt: orderCreatedAt,
      }),
    },
  });

  if (isPaid && !order.invoiceCompleteAt) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        invoiceCompleteAt: orderCreatedAt,
      },
    });
  }

  // Finance approval gate: Koko/bank transfer orders wait for finance approval before fulfillment
  if (isNewOrder && isOrderPaymentRequiresApproval({ paymentGatewayPrimary: paymentGateways.primary, paymentGatewayNames: paymentGateways.names })) {
    void createOrGetOrderPaymentApproval({
      companyId,
      orderId: order.id,
      requestedById: null,
      invoiceLabel: order.name ?? order.orderNumber ?? order.shopifyOrderId,
      paymentType: paymentGateways.primary ?? paymentGateways.names[0] ?? "bank/koko",
      amount: totalPrice.toString(),
    }).catch((err) => console.error("[Finance approval] webhook trigger failed:", err));
  }

  const assignedMerchant = assignedMerchantId
    ? await prisma.user.findUnique({
        where: { id: assignedMerchantId },
        select: { name: true, email: true },
      })
    : null;

  await syncContactMasterFromShopifyOrder({
    companyId,
    shopifyOrderId: String(data.id),
    orderNumber: data.order_number != null ? String(data.order_number) : data.name?.slice(0, 100) ?? null,
    orderCreatedAt,
    order: data,
    recentMerchant: assignedMerchant?.name ?? assignedMerchant?.email ?? null,
  });

  const incomingLineItemIds = Array.from(
    new Set(data.line_items.map((lineItem) => String(lineItem.id)))
  );
  for (const lineItem of data.line_items) {
    await ensureProductItemAndCreateLineItem(order, lineItem, effectiveLocation);
  }
  await prisma.orderLineItem.deleteMany({
    where: {
      orderId: order.id,
      ...(incomingLineItemIds.length > 0
        ? { shopifyLineItemId: { notIn: incomingLineItemIds } }
        : {}),
    },
  });

  if (isNewOrder) {
    const addr = data.shipping_address as { name?: string; first_name?: string; last_name?: string } | undefined;
    const parts = [addr?.first_name, addr?.last_name].filter(Boolean).join(" ").trim();
    const customerName = (addr?.name ?? parts) || undefined;
    sendOrderSms(companyId, order.id, "order_received", {
      orderNumber: order.orderNumber ?? order.name ?? order.shopifyOrderId,
      orderName: order.name ?? undefined,
      customerName: customerName || undefined,
      customerPhone: customerPhone ?? undefined,
      locationName: effectiveLocation.name,
    }).catch((err) => console.error("[Order SMS] order_received failed:", err));
  }

  if (isNewOrder || !existingOrder?.erpnextInvoiceId) {
    // Atomically claim the sync slot to prevent duplicate SI on concurrent webhooks
    const claimed = await prisma.order.updateMany({
      where: { id: order.id, erpnextInvoiceId: null },
      data: { erpnextInvoiceId: "pending" },
    });
    if (claimed.count > 0) {
      try {
        await syncOrderToERPNext(order, effectiveLocation, data);
      } catch (err) {
        console.error("[ERPNext] sync failed:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        await prisma.order.update({
          where: { id: order.id },
          data: { erpnextInvoiceId: null, erpnextSyncError: errMsg, erpnextSyncFailedAt: new Date() },
        });
      }
    }
  }

  if (data.financial_status?.toLowerCase() === "voided") {
    try {
      await cancelErpnextSalesInvoice(
        order.name ?? order.shopifyOrderId,
        effectiveLocation,
      );
    } catch (err) {
      console.error("[ERPNext] cancel sales invoice failed:", err);
    }
  }
}

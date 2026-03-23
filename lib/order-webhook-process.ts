import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";
import type { CompanyLocation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LIMITS } from "@/lib/validation";
import { ensureCustomerAndLink } from "@/lib/order-customers";
import { resolveAssignedMerchant } from "@/lib/order-assignment";
import { ensureProductItemAndCreateLineItem } from "@/lib/order-line-items";
import { sendOrderSms } from "@/lib/order-sms";

function parseDecimal(value: string | null | undefined): Decimal | null {
  if (value == null || value === "") return null;
  const num = parseFloat(value);
  return Number.isNaN(num) ? null : new Decimal(value);
}

export async function processOrderWebhook(
  data: ShopifyOrderWebhookPayload,
  location: CompanyLocation,
  rawPayload: unknown
): Promise<void> {
  const companyId = location.companyId;

  const existingOrder = await prisma.order.findUnique({
    where: { shopifyOrderId: String(data.id) },
  });
  const isNewOrder = !existingOrder;

  const customerId = await ensureCustomerAndLink(data, companyId, isNewOrder);
  const assignedMerchantId = await resolveAssignedMerchant(data, location);

  const sourceName = (data.source_name ?? "web").trim().slice(0, 20) || "web";
  const totalPrice = parseDecimal(data.total_price) ?? new Decimal(0);
  const subtotalPrice = parseDecimal(
    data.subtotal_price ?? data.current_subtotal_price
  );
  const totalDiscounts = parseDecimal(
    data.total_discounts ?? data.current_total_discounts
  );
  const totalTax = parseDecimal(data.total_tax ?? data.current_total_tax);

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

  const orderData = {
    companyId,
    companyLocationId: location.id,
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
  const now = new Date();

  const order = await prisma.order.upsert({
    where: { shopifyOrderId: String(data.id) },
    create: {
      ...orderData,
      ...(isPaid && {
        invoiceCompleteAt: now,
        fulfillmentStage: "invoice_complete" as const,
      }),
    },
    update: orderData,
  });

  if (isPaid && !order.invoiceCompleteAt) {
    const stagesBeforeInvoice = [
      "order_received",
      "sample_free_issue",
      "print",
      "ready_to_dispatch",
      "dispatched",
    ];
    if (stagesBeforeInvoice.includes(order.fulfillmentStage)) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          invoiceCompleteAt: now,
          fulfillmentStage: "invoice_complete",
        },
      });
    }
  }

  await prisma.orderLineItem.deleteMany({
    where: { orderId: order.id },
  });

  for (const lineItem of data.line_items) {
    await ensureProductItemAndCreateLineItem(order, lineItem, location);
  }

  if (isNewOrder) {
    const addr = data.shipping_address as { name?: string; first_name?: string; last_name?: string } | undefined;
    const parts = [addr?.first_name, addr?.last_name].filter(Boolean).join(" ").trim();
    const customerName = (addr?.name ?? parts) || undefined;
    sendOrderSms(companyId, order.id, "order_received", {
      orderNumber: order.orderNumber ?? order.name ?? order.shopifyOrderId,
      orderName: order.name ?? undefined,
      customerName: customerName || undefined,
      customerPhone: customerPhone ?? undefined,
      locationName: location.name,
    }).catch((err) => console.error("[Order SMS] order_received failed:", err));
  }
}

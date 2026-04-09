import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { randomUUID } from "crypto";

import type { CreateManualOrderBody } from "@/lib/validation/manual-order";
import { prisma } from "@/lib/prisma";
import { LIMITS } from "@/lib/validation";
import { sendOrderSms } from "@/lib/order-sms";

function padSeq(seq: number, padding: number): string {
  return String(seq).padStart(padding, "0");
}

export async function createManualOrder(
  companyId: string,
  body: CreateManualOrderBody
): Promise<{ orderId: string; invoiceNumber: string }> {
  const orderDiscount = new Decimal(body.orderDiscountPercent ?? 0);

  const location = await prisma.companyLocation.findFirst({
    where: { id: body.companyLocationId, companyId },
    select: {
      id: true,
      name: true,
      companyId: true,
      manualInvoicePrefix: true,
      manualInvoiceSeqPadding: true,
      defaultMerchantUserId: true,
    },
  });

  if (!location) {
    throw new Error("Location not found");
  }

  const prefix = location.manualInvoicePrefix?.trim() ?? "";
  if (!prefix) {
    throw new Error(
      "Manual invoice prefix is not configured for this location. Set it in Settings → Locations."
    );
  }

  const padding = location.manualInvoiceSeqPadding ?? 3;

  const productIds = body.lines.map((l) => l.productItemId);
  const productItems = await prisma.productItem.findMany({
    where: {
      id: { in: productIds },
      companyId,
      companyLocationId: location.id,
    },
    select: {
      id: true,
      price: true,
    },
  });
  const productById = new Map(productItems.map((p) => [p.id, p]));
  for (const line of body.lines) {
    if (!productById.has(line.productItemId)) {
      throw new Error("One or more products are invalid for this location");
    }
  }

  let shippingOption: { id: string; label: string; amount: Decimal } | null = null;
  if (body.shippingChargeOptionId) {
    const opt = await prisma.shippingChargeOption.findFirst({
      where: {
        id: body.shippingChargeOptionId,
        companyId,
        companyLocationId: location.id,
      },
    });
    if (!opt) {
      throw new Error("Shipping option not found for this location");
    }
    shippingOption = { id: opt.id, label: opt.label, amount: opt.amount };
  }

  let assignedMerchantId: string | null =
    body.assignedMerchantId === undefined
      ? location.defaultMerchantUserId ?? null
      : body.assignedMerchantId;
  if (assignedMerchantId) {
    const m = await prisma.user.findFirst({
      where: { id: assignedMerchantId, companyId },
      select: { id: true },
    });
    if (!m) {
      throw new Error("Assigned merchant must be a user in your company");
    }
  }

  const shippingJson: Prisma.InputJsonValue | typeof Prisma.JsonNull =
    shippingOption
      ? ([
          {
            title: shippingOption.label,
            price: shippingOption.amount.toString(),
            discounted_price: shippingOption.amount.toString(),
          },
        ] as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;

  const customerEmail =
    body.customerEmail?.slice(0, LIMITS.email.max) ?? null;
  const customerPhone = body.customerPhone?.trim().slice(0, LIMITS.mobile.max) ?? null;

  const shippingAddr = body.shippingAddress;
  const billingAddr = body.billingAddress;
  const shippingAddressJson: Prisma.InputJsonValue | typeof Prisma.JsonNull =
    shippingAddr && Object.keys(shippingAddr).length > 0
      ? ({
          ...shippingAddr,
          name: body.customerName?.trim() ?? shippingAddr.name,
        } as Prisma.InputJsonValue)
      : body.customerName
        ? ({ name: body.customerName.trim() } as Prisma.InputJsonValue)
        : Prisma.JsonNull;
  const billingAddressJson: Prisma.InputJsonValue | typeof Prisma.JsonNull =
    billingAddr && Object.keys(billingAddr).length > 0
      ? (billingAddr as Prisma.InputJsonValue)
      : shippingAddressJson;

  const result = await prisma.$transaction(async (tx) => {
    const loc = await tx.companyLocation.update({
      where: { id: location.id },
      data: { manualInvoiceNextSeq: { increment: 1 } },
      select: { manualInvoiceNextSeq: true },
    });

    const seq = loc.manualInvoiceNextSeq;
    const invoiceNumber = `${prefix}${padSeq(seq, padding)}`;
    const shopifyOrderId = `manual-${randomUUID()}`;

    let listSubtotal = new Decimal(0);
    let discountedSubtotal = new Decimal(0);
    const lineCreates: Array<{
      productItemId: string;
      shopifyLineItemId: string;
      quantity: number;
      price: Decimal;
      discountPercent: Decimal | null;
    }> = [];

    for (const line of body.lines) {
      const pi = productById.get(line.productItemId)!;
      const listUnit = new Decimal(pi.price);
      const lineDisc =
        line.discountPercent != null
          ? new Decimal(line.discountPercent)
          : orderDiscount;
      const pct = lineDisc.gt(100) ? new Decimal(100) : lineDisc.lt(0) ? new Decimal(0) : lineDisc;
      const factor = new Decimal(1).minus(pct.div(100));
      const unitSale = listUnit.mul(factor);
      const qty = line.quantity;
      listSubtotal = listSubtotal.add(listUnit.mul(qty));
      discountedSubtotal = discountedSubtotal.add(unitSale.mul(qty));
      lineCreates.push({
        productItemId: pi.id,
        shopifyLineItemId: `manual-line-${randomUUID()}`,
        quantity: qty,
        price: unitSale,
        discountPercent: pct.gt(0) ? pct : null,
      });
    }

    const totalDiscounts = listSubtotal.minus(discountedSubtotal);
    const totalShipping = shippingOption?.amount ?? new Decimal(0);
    const totalTax = new Decimal(0);
    const totalPrice = discountedSubtotal.add(totalShipping).add(totalTax);

    const created = await tx.order.create({
      data: {
        companyId,
        companyLocationId: location.id,
        assignedMerchantId,
        customerId: null,
        shopifyOrderId,
        sourceName: "manual",
        shopifyUserId: null,
        orderNumber: invoiceNumber,
        name: invoiceNumber,
        totalPrice,
        subtotalPrice: listSubtotal,
        totalDiscounts,
        totalTax,
        totalShipping: shippingOption ? totalShipping : null,
        currency: "LKR",
        financialStatus: "pending",
        fulfillmentStatus: "unfulfilled",
        paymentGatewayNames: ["cod"],
        paymentGatewayPrimary: "cod",
        customerEmail,
        customerPhone,
        shippingAddress: shippingAddressJson,
        billingAddress: billingAddressJson,
        discountCodes: Prisma.JsonNull,
        discountApplications: Prisma.JsonNull,
        shippingLines: shippingJson,
        rawPayload: Prisma.JsonNull,
        fulfillmentStage: "order_received",
      },
    });

    await tx.orderLineItem.createMany({
      data: lineCreates.map((lc) => ({
        orderId: created.id,
        productItemId: lc.productItemId,
        shopifyLineItemId: lc.shopifyLineItemId,
        quantity: lc.quantity,
        price: lc.price,
        discountPercent: lc.discountPercent,
      })),
    });

    return { orderId: created.id, invoiceNumber };
  });

  const customerName =
    body.customerName?.trim() ||
    body.shippingAddress?.name?.trim() ||
    undefined;

  sendOrderSms(companyId, result.orderId, "order_received", {
    orderNumber: result.invoiceNumber,
    orderName: result.invoiceNumber,
    customerName: customerName || undefined,
    customerPhone: customerPhone ?? undefined,
    locationName: location.name,
  }).catch((err) => console.error("[Order SMS] order_received manual failed:", err));

  return result;
}

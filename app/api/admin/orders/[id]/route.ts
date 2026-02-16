import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  const companyId = user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const order = await prisma.order.findFirst({
    where: { id: idResult.data, companyId },
    include: {
      companyLocation: { select: { id: true, name: true, shopifyShopName: true } },
      assignedMerchant: { select: { id: true, name: true, email: true } },
      lineItems: {
        include: {
          productItem: {
            select: {
              id: true,
              productTitle: true,
              variantTitle: true,
              sku: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const lineItems = order.lineItems.map((li) => ({
    id: li.id,
    productTitle: li.productItem.productTitle,
    variantTitle: li.productItem.variantTitle,
    sku: li.productItem.sku,
    quantity: li.quantity,
    price: li.price.toString(),
    total: (Number(li.price) * li.quantity).toFixed(2),
  }));

  return NextResponse.json({
    id: order.id,
    shopifyOrderId: order.shopifyOrderId,
    orderNumber: order.orderNumber,
    name: order.name,
    sourceName: order.sourceName,
    totalPrice: order.totalPrice.toString(),
    subtotalPrice: order.subtotalPrice?.toString() ?? null,
    totalDiscounts: order.totalDiscounts?.toString() ?? null,
    totalTax: order.totalTax?.toString() ?? null,
    totalShipping: order.totalShipping?.toString() ?? null,
    currency: order.currency,
    financialStatus: order.financialStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    shippingAddress: order.shippingAddress,
    billingAddress: order.billingAddress,
    discountCodes: order.discountCodes,
    createdAt: order.createdAt.toISOString(),
    companyLocation: order.companyLocation,
    assignedMerchant: order.assignedMerchant,
    lineItems,
    shopifyAdminOrderUrl:
      order.companyLocation.shopifyShopName
        ? `https://admin.shopify.com/store/${order.companyLocation.shopifyShopName}/orders/${order.shopifyOrderId}`
        : null,
  });
}

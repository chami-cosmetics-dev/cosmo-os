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
      companyLocation: { select: { id: true, name: true, shopifyShopName: true, shopifyAdminStoreHandle: true } },
      assignedMerchant: { select: { id: true, name: true, email: true } },
      packageHoldReason: { select: { id: true, name: true } },
      packageReadyBy: { select: { id: true, name: true, email: true } },
      dispatchedBy: { select: { id: true, name: true, email: true } },
      dispatchedByRider: { select: { id: true, name: true, mobile: true } },
      dispatchedByCourierService: { select: { id: true, name: true } },
      invoiceCompleteBy: { select: { id: true, name: true, email: true } },
      deliveryCompleteBy: { select: { id: true, name: true, email: true } },
      lastPrintedBy: { select: { id: true, name: true, email: true } },
      sampleFreeIssues: {
        include: {
          sampleFreeIssueItem: { select: { id: true, name: true, type: true } },
          addedBy: { select: { id: true, name: true, email: true } },
        },
      },
      remarks: { orderBy: { createdAt: "desc" } },
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
    shopifyAdminOrderUrl: (() => {
      const handle = order.companyLocation.shopifyAdminStoreHandle ?? order.companyLocation.shopifyShopName;
      return handle
        ? `https://admin.shopify.com/store/${handle}/orders/${order.shopifyOrderId}`
        : null;
    })(),
    fulfillmentStage: order.fulfillmentStage,
    printCount: order.printCount,
    packageReadyAt: order.packageReadyAt?.toISOString() ?? null,
    packageReadyBy: order.packageReadyBy ? { id: order.packageReadyBy.id, name: order.packageReadyBy.name, email: order.packageReadyBy.email } : null,
    packageOnHoldAt: order.packageOnHoldAt?.toISOString() ?? null,
    packageHoldReason: order.packageHoldReason,
    dispatchedAt: order.dispatchedAt?.toISOString() ?? null,
    dispatchedBy: order.dispatchedBy ? { id: order.dispatchedBy.id, name: order.dispatchedBy.name, email: order.dispatchedBy.email } : null,
    dispatchedByRider: order.dispatchedByRider,
    dispatchedByCourierService: order.dispatchedByCourierService,
    invoiceCompleteAt: order.invoiceCompleteAt?.toISOString() ?? null,
    invoiceCompleteBy: order.invoiceCompleteBy ? { id: order.invoiceCompleteBy.id, name: order.invoiceCompleteBy.name, email: order.invoiceCompleteBy.email } : null,
    deliveryCompleteAt: order.deliveryCompleteAt?.toISOString() ?? null,
    deliveryCompleteBy: order.deliveryCompleteBy ? { id: order.deliveryCompleteBy.id, name: order.deliveryCompleteBy.name, email: order.deliveryCompleteBy.email } : null,
    lastPrintedAt: order.lastPrintedAt?.toISOString() ?? null,
    lastPrintedBy: order.lastPrintedBy ? { id: order.lastPrintedBy.id, name: order.lastPrintedBy.name, email: order.lastPrintedBy.email } : null,
    sampleFreeIssues: order.sampleFreeIssues.map((s) => ({
      id: s.id,
      sampleFreeIssueItem: s.sampleFreeIssueItem,
      quantity: s.quantity,
      createdAt: s.createdAt.toISOString(),
      addedBy: s.addedBy ? { id: s.addedBy.id, name: s.addedBy.name, email: s.addedBy.email } : null,
    })),
    remarks: order.remarks.map((r) => ({
      id: r.id,
      stage: r.stage,
      type: r.type,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

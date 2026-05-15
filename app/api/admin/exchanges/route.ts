import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  calculateExchangePaymentDifference,
  orderDisplayLabel,
  requiresOldItemCollection,
} from "@/lib/rider-delivery-special";

const exchangeCreateSchema = z.object({
  originalReference: z.string().trim().min(1).max(120),
  replacementReference: z.string().trim().min(1).max(120),
  reason: z.enum(["damaged_item", "wrong_item", "other"]),
  remark: z.string().trim().max(5000).nullable().optional(),
});

function pickCustomerName(order: {
  customer?: { firstName: string | null; lastName: string | null } | null;
  shippingAddress: unknown;
  name: string | null;
}) {
  if (order.customer?.firstName || order.customer?.lastName) {
    return [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ").trim();
  }
  if (order.shippingAddress && typeof order.shippingAddress === "object") {
    const shipping = order.shippingAddress as Record<string, unknown>;
    const raw = shipping.name ?? [shipping.first_name, shipping.last_name].filter(Boolean).join(" ").trim();
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return order.name;
}

async function resolveOrder(companyId: string, reference: string) {
  const matches = await prisma.order.findMany({
    where: {
      companyId,
      OR: [{ name: reference }, { orderNumber: reference }, { shopifyOrderId: reference }],
    },
    take: 2,
    select: {
      id: true,
      assignedMerchantId: true,
      customerEmail: true,
      customerPhone: true,
      shippingAddress: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      totalPrice: true,
      customer: { select: { firstName: true, lastName: true } },
    },
  });
  return matches.length === 1 ? matches[0]! : null;
}

async function resolveOrderStatus(companyId: string, reference: string) {
  const trimmed = reference.trim();
  if (!trimmed) {
    return { status: "empty" as const, reference: trimmed, order: null };
  }

  const matches = await prisma.order.findMany({
    where: {
      companyId,
      OR: [{ name: trimmed }, { orderNumber: trimmed }, { shopifyOrderId: trimmed }],
    },
    take: 2,
    select: {
      id: true,
      orderNumber: true,
      name: true,
      shopifyOrderId: true,
      customerEmail: true,
      customerPhone: true,
      assignedMerchant: { select: { name: true, email: true } },
    },
  });

  if (matches.length === 0) {
    return { status: "not_found" as const, reference: trimmed, order: null };
  }
  if (matches.length > 1) {
    return { status: "ambiguous" as const, reference: trimmed, order: null };
  }

  const order = matches[0]!;
  return {
    status: "found" as const,
    reference: trimmed,
    order: {
      id: order.id,
      invoiceNo: order.name ?? order.orderNumber ?? order.shopifyOrderId,
      customer: order.customerPhone ?? order.customerEmail ?? null,
      merchant: order.assignedMerchant?.name ?? order.assignedMerchant?.email ?? null,
    },
  };
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("exchanges.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const originalReference = request.nextUrl.searchParams.get("originalReference") ?? "";
  const replacementReference = request.nextUrl.searchParams.get("replacementReference") ?? "";

  const [original, replacement] = await Promise.all([
    resolveOrderStatus(companyId, originalReference),
    resolveOrderStatus(companyId, replacementReference),
  ]);

  return NextResponse.json({ original, replacement });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("exchanges.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = exchangeCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const companyId = auth.context!.user!.companyId;
  const actorUserId = auth.context!.user!.id;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const originalReference = parsed.data.originalReference.trim();
  const replacementReference = parsed.data.replacementReference.trim();
  const [originalOrder, replacementOrder] = await Promise.all([
    resolveOrder(companyId, originalReference),
    resolveOrder(companyId, replacementReference),
  ]);

  const [originalStatus, replacementStatus] = await Promise.all([
    resolveOrderStatus(companyId, originalReference),
    resolveOrderStatus(companyId, replacementReference),
  ]);

  if (originalStatus.status !== "found") {
    return NextResponse.json({ error: "Original invoice/order must match an existing order" }, { status: 400 });
  }
  if (replacementStatus.status === "ambiguous") {
    return NextResponse.json({ error: "Replacement invoice/order matched more than one order" }, { status: 400 });
  }

  const exchange = await prisma.$transaction(async (tx) => {
    const created = await tx.orderExchange.create({
      data: {
        companyId,
        originalReference,
        replacementReference,
        originalOrderId: originalOrder?.id ?? null,
        replacementOrderId: replacementOrder?.id ?? null,
        merchantUserId: originalOrder?.assignedMerchantId ?? replacementOrder?.assignedMerchantId ?? null,
        customerName: originalOrder ? pickCustomerName(originalOrder) : replacementOrder ? pickCustomerName(replacementOrder) : null,
        customerEmail: originalOrder?.customerEmail ?? replacementOrder?.customerEmail ?? null,
        customerPhone: originalOrder?.customerPhone ?? replacementOrder?.customerPhone ?? null,
        reason: parsed.data.reason,
        remark: parsed.data.remark?.trim() || null,
        createdById: actorUserId,
      },
    });

    if (replacementOrder) {
      await tx.riderDeliveryTask.updateMany({
        where: { orderId: replacementOrder.id },
        data: {
          deliveryKind: "exchange",
          exchangeId: created.id,
          oldOrderLabel: originalOrder ? orderDisplayLabel(originalOrder) : originalReference,
          replacementOrderLabel: orderDisplayLabel(replacementOrder),
          requiresOldItemCollection: requiresOldItemCollection(created.reason),
          oldItemCollectionStatus: "pending",
          oldItemCollectionRemark: null,
          exchangePaymentDifference: calculateExchangePaymentDifference({
            originalOrder,
            replacementOrder,
          }),
        },
      });
    }

    return created;
  });

  await writeAuditLog({
    companyId,
    actorUserId,
    module: "orders",
    action: "exchange_created",
    entityType: "OrderExchange",
    entityId: exchange.id,
    summary: `Created exchange ${originalReference} -> ${replacementReference}`,
    afterData: {
      originalReference,
      replacementReference,
      reason: exchange.reason,
      status: exchange.status,
    },
  });

  return NextResponse.json({
    ok: true,
    exchange: {
      id: exchange.id,
    },
  });
}

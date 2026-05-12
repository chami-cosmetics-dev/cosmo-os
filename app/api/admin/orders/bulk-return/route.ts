import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

const bulkReturnSchema = z.object({
  action: z.enum(["preview", "confirm"]),
  references: z.string().trim().min(1).max(12000),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type BulkReturnStatus =
  | "valid"
  | "not_found"
  | "duplicate_input"
  | "not_dispatched"
  | "missing_dispatch_date"
  | "ambiguous_match"
  | "processed"
  | "failed";

type BulkReturnRow = {
  input: string;
  status: BulkReturnStatus;
  message: string;
  orderId: string | null;
  invoiceNo: string | null;
  merchant: string | null;
  customer: string | null;
  shippingService: string | null;
  dispatchedAt: string | null;
};

function parseReferences(input: string) {
  return input
    .split(/[\n,;\t]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 200);
}

function duplicateKey(value: string) {
  return value.trim().toLowerCase();
}

function dateOnlyUtc(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function getOrderLabel(order: {
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string;
}) {
  return order.name ?? order.orderNumber ?? order.shopifyOrderId;
}

function getCustomerName(order: {
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

function getShippingService(order: {
  dispatchedByRiderId: string | null;
  dispatchedByRider: { name: string | null; mobile: string | null } | null;
  dispatchedByCourierService: { name: string } | null;
}) {
  if (order.dispatchedByRiderId) {
    return {
      type: "rider",
      name: order.dispatchedByRider?.name ?? order.dispatchedByRider?.mobile ?? "Rider",
    };
  }
  return {
    type: "courier",
    name: order.dispatchedByCourierService?.name ?? "Courier",
  };
}

async function buildPreviewRows(companyId: string, referencesText: string): Promise<BulkReturnRow[]> {
  const rawRefs = parseReferences(referencesText);
  const seen = new Set<string>();
  const uniqueRefs: string[] = [];
  const duplicateRows: BulkReturnRow[] = [];

  for (const ref of rawRefs) {
    const key = duplicateKey(ref);
    if (seen.has(key)) {
      duplicateRows.push({
        input: ref,
        status: "duplicate_input",
        message: "Duplicate input",
        orderId: null,
        invoiceNo: null,
        merchant: null,
        customer: null,
        shippingService: null,
        dispatchedAt: null,
      });
      continue;
    }
    seen.add(key);
    uniqueRefs.push(ref);
  }

  const orders = uniqueRefs.length
    ? await prisma.order.findMany({
        where: {
          companyId,
          OR: [
            { name: { in: uniqueRefs } },
            { orderNumber: { in: uniqueRefs } },
            { shopifyOrderId: { in: uniqueRefs } },
          ],
        },
        select: {
          id: true,
          shopifyOrderId: true,
          orderNumber: true,
          name: true,
          fulfillmentStage: true,
          dispatchedAt: true,
          assignedMerchantId: true,
          shippingAddress: true,
          customer: { select: { firstName: true, lastName: true } },
          assignedMerchant: { select: { name: true, email: true } },
          dispatchedByRiderId: true,
          dispatchedByRider: { select: { name: true, mobile: true } },
          dispatchedByCourierService: { select: { name: true } },
        },
      })
    : [];

  const rows: BulkReturnRow[] = uniqueRefs.map((ref) => {
    const matches = orders.filter(
      (order) => order.name === ref || order.orderNumber === ref || order.shopifyOrderId === ref
    );
    if (matches.length === 0) {
      return {
        input: ref,
        status: "not_found",
        message: "Order not found",
        orderId: null,
        invoiceNo: null,
        merchant: null,
        customer: null,
        shippingService: null,
        dispatchedAt: null,
      };
    }
    if (matches.length > 1) {
      return {
        input: ref,
        status: "ambiguous_match",
        message: "More than one order matched this reference",
        orderId: null,
        invoiceNo: null,
        merchant: null,
        customer: null,
        shippingService: null,
        dispatchedAt: null,
      };
    }

    const order = matches[0]!;
    const shipping = getShippingService(order);
    const base = {
      input: ref,
      orderId: order.id,
      invoiceNo: getOrderLabel(order),
      merchant: order.assignedMerchant?.name ?? order.assignedMerchant?.email ?? null,
      customer: getCustomerName(order),
      shippingService: shipping.name,
      dispatchedAt: order.dispatchedAt?.toISOString() ?? null,
    };

    if (order.fulfillmentStage !== "dispatched") {
      return {
        ...base,
        status: "not_dispatched",
        message: `Order is ${order.fulfillmentStage}, not dispatched`,
      };
    }
    if (!order.dispatchedAt) {
      return {
        ...base,
        status: "missing_dispatch_date",
        message: "Order has no dispatch date",
      };
    }

    return {
      ...base,
      status: "valid",
      message: "Ready to mark returned",
    };
  });

  return [...rows, ...duplicateRows];
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("returns.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = bulkReturnSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const companyId = auth.context!.user!.companyId;
  const actorUserId = auth.context!.user!.id;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const returnDate = dateOnlyUtc(parsed.data.returnDate);
  if (Number.isNaN(returnDate.getTime())) {
    return NextResponse.json({ error: "Invalid return date" }, { status: 400 });
  }

  const previewRows = await buildPreviewRows(companyId, parsed.data.references);
  const validRows = previewRows.filter((row) => row.status === "valid" && row.orderId);

  if (parsed.data.action === "preview") {
    return NextResponse.json({
      rows: previewRows,
      counts: {
        total: previewRows.length,
        valid: validRows.length,
        invalid: previewRows.length - validRows.length,
      },
    });
  }

  const results: BulkReturnRow[] = [];
  for (const row of previewRows) {
    if (row.status !== "valid" || !row.orderId) {
      results.push(row);
      continue;
    }

    try {
      const order = await prisma.order.findFirst({
        where: { id: row.orderId, companyId },
        include: {
          dispatchedByCourierService: true,
          dispatchedByRider: true,
        },
      });

      if (!order) {
        results.push({ ...row, status: "not_found", message: "Order not found during confirm" });
        continue;
      }
      if (order.fulfillmentStage !== "dispatched") {
        results.push({
          ...row,
          status: "not_dispatched",
          message: `Order is ${order.fulfillmentStage}, not dispatched`,
        });
        continue;
      }
      if (!order.dispatchedAt) {
        results.push({ ...row, status: "missing_dispatch_date", message: "Order has no dispatch date" });
        continue;
      }

      const shipping = getShippingService(order);
      const returnedOrder = await prisma.$transaction(async (tx) => {
        const createdReturn = await tx.orderReturn.create({
          data: {
            companyId,
            orderId: order.id,
            merchantUserId: order.assignedMerchantId,
            dispatchedAt: order.dispatchedAt!,
            returnDate,
            shippingServiceType: shipping.type,
            shippingServiceName: shipping.name,
            riderId: order.dispatchedByRiderId,
            courierServiceId: order.dispatchedByCourierServiceId,
            returnedById: actorUserId,
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            fulfillmentStage: "returned_to_store",
            fulfillmentStatus: "unfulfilled",
            packageReadyAt: null,
            packageReadyById: null,
            packageOnHoldAt: null,
            packageHoldReasonId: null,
            dispatchedAt: null,
            dispatchedById: null,
            dispatchedByRiderId: null,
            dispatchedByCourierServiceId: null,
            deliveryOutcome: "pending",
            deliveryFailedReason: null,
            deliveryCompleteAt: null,
            deliveryCompleteById: null,
            lastRiderUpdateAt: null,
            riderDeliveryToken: null,
          },
        });

        await tx.riderDeliveryTask.deleteMany({ where: { orderId: order.id } });
        return createdReturn;
      });

      await writeAuditLog({
        companyId,
        actorUserId,
        module: "orders",
        action: "returned_order_recorded",
        entityType: "OrderReturn",
        entityId: returnedOrder.id,
        summary: `Bulk recorded return for order ${getOrderLabel(order)}`,
        afterData: {
          orderId: order.id,
          returnDate,
          dispatchedAt: order.dispatchedAt,
          shippingServiceType: shipping.type,
          shippingServiceName: shipping.name,
        },
        metadata: {
          bulk: true,
          input: row.input,
        },
      });

      await writeAuditLog({
        companyId,
        actorUserId,
        module: "orders",
        action: "fulfillment_updated",
        entityType: "Order",
        entityId: order.id,
        summary: `Bulk marked order ${getOrderLabel(order)} as returned to store`,
        beforeData: { fulfillmentStage: order.fulfillmentStage },
        afterData: { fulfillmentStage: "returned_to_store" },
        metadata: {
          action: "bulk_mark_returned",
          returnDate: returnDate.toISOString(),
          dispatchedAt: order.dispatchedAt.toISOString(),
          shippingServiceType: shipping.type,
          shippingServiceName: shipping.name,
        },
      });

      results.push({
        ...row,
        status: "processed",
        message: "Returned to store",
      });
    } catch (error) {
      console.error("Bulk return failed:", error);
      results.push({
        ...row,
        status: "failed",
        message: "Failed to mark returned",
      });
    }
  }

  return NextResponse.json({
    rows: results,
    counts: {
      total: results.length,
      processed: results.filter((row) => row.status === "processed").length,
      failed: results.filter((row) => row.status === "failed").length,
      invalid: results.filter((row) => row.status !== "processed" && row.status !== "failed").length,
    },
  });
}

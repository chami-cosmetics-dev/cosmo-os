import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { createInvoiceRevertVoidApproval } from "@/lib/approval-workflow";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  buildReturnRemarkText,
  isReturnRemarkTemplateCode,
  RETURN_REMARK_TEMPLATE_CODES,
} from "@/lib/return-remark-templates";
import { orderStageUpdate } from "@/lib/order-stage-timing";
import { parseAppCalendarDayStart } from "@/lib/format-datetime";

const bulkReturnEntrySchema = z.object({
  reference: z.string().trim().min(1).max(120),
  remarkTemplate: z.enum(RETURN_REMARK_TEMPLATE_CODES),
  customRemark: z.string().trim().max(500).optional().nullable(),
});

const bulkReturnSchema = z.object({
  action: z.enum(["preview", "confirm"]),
  entries: z.array(bulkReturnEntrySchema).min(1).max(200).optional(),
  references: z.string().trim().min(1).max(12000).optional(),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

type BulkReturnStatus =
  | "valid"
  | "not_found"
  | "duplicate_input"
  | "not_dispatched"
  | "missing_dispatch_date"
  | "ambiguous_match"
  | "missing_remark"
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
  remarkTemplate: string | null;
  returnRemark: string | null;
};

type NormalizedEntry = {
  reference: string;
  remarkTemplate: z.infer<typeof bulkReturnEntrySchema>["remarkTemplate"];
  customRemark: string | null;
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

function resolveBulkReturnDate(ymd?: string) {
  return parseAppCalendarDayStart(ymd) ?? new Date();
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

function normalizeEntries(payload: z.infer<typeof bulkReturnSchema>): NormalizedEntry[] {
  if (payload.entries?.length) {
    return payload.entries.map((entry) => ({
      reference: entry.reference,
      remarkTemplate: entry.remarkTemplate,
      customRemark: entry.customRemark?.trim() || null,
    }));
  }
  if (payload.references) {
    return parseReferences(payload.references).map((reference) => ({
      reference,
      remarkTemplate: "UTC" as const,
      customRemark: null,
    }));
  }
  return [];
}

async function buildPreviewRows(companyId: string, entries: NormalizedEntry[]): Promise<BulkReturnRow[]> {
  const seen = new Set<string>();
  const uniqueEntries: NormalizedEntry[] = [];
  const duplicateRows: BulkReturnRow[] = [];

  for (const entry of entries) {
    const key = duplicateKey(entry.reference);
    if (seen.has(key)) {
      duplicateRows.push({
        input: entry.reference,
        status: "duplicate_input",
        message: "Duplicate input",
        orderId: null,
        invoiceNo: null,
        merchant: null,
        customer: null,
        shippingService: null,
        dispatchedAt: null,
        remarkTemplate: entry.remarkTemplate,
        returnRemark: null,
      });
      continue;
    }
    seen.add(key);
    uniqueEntries.push(entry);
  }

  const refs = uniqueEntries.map((entry) => entry.reference);
  const orders = refs.length
    ? await prisma.order.findMany({
        where: {
          companyId,
          OR: [
            { name: { in: refs } },
            { orderNumber: { in: refs } },
            { shopifyOrderId: { in: refs } },
          ],
        },
        select: {
          id: true,
          shopifyOrderId: true,
          orderNumber: true,
          name: true,
          fulfillmentStage: true,
          dispatchedAt: true,
          revertedFromInvoiceCompleteAt: true,
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

  const rows: BulkReturnRow[] = uniqueEntries.map((entry) => {
    const returnRemark = buildReturnRemarkText({
      remarkTemplate: entry.remarkTemplate,
      customRemark: entry.customRemark,
    });
    if (!returnRemark) {
      return {
        input: entry.reference,
        status: "missing_remark",
        message: "Custom remark is required for custom template",
        orderId: null,
        invoiceNo: null,
        merchant: null,
        customer: null,
        shippingService: null,
        dispatchedAt: null,
        remarkTemplate: entry.remarkTemplate,
        returnRemark: null,
      };
    }

    const matches = orders.filter(
      (order) =>
        order.name === entry.reference ||
        order.orderNumber === entry.reference ||
        order.shopifyOrderId === entry.reference
    );
    if (matches.length === 0) {
      return {
        input: entry.reference,
        status: "not_found",
        message: "Order not found",
        orderId: null,
        invoiceNo: null,
        merchant: null,
        customer: null,
        shippingService: null,
        dispatchedAt: null,
        remarkTemplate: entry.remarkTemplate,
        returnRemark,
      };
    }
    if (matches.length > 1) {
      return {
        input: entry.reference,
        status: "ambiguous_match",
        message: "More than one order matched this reference",
        orderId: null,
        invoiceNo: null,
        merchant: null,
        customer: null,
        shippingService: null,
        dispatchedAt: null,
        remarkTemplate: entry.remarkTemplate,
        returnRemark,
      };
    }

    const order = matches[0]!;
    const shipping = getShippingService(order);
    const base = {
      input: entry.reference,
      orderId: order.id,
      invoiceNo: getOrderLabel(order),
      merchant: order.assignedMerchant?.name ?? order.assignedMerchant?.email ?? null,
      customer: getCustomerName(order),
      shippingService: shipping.name,
      dispatchedAt: order.dispatchedAt?.toISOString() ?? null,
      remarkTemplate: entry.remarkTemplate,
      returnRemark,
    };

    const isFinanceReverted =
      order.fulfillmentStage === "delivery_complete" && !!order.revertedFromInvoiceCompleteAt;
    if (!isFinanceReverted && order.fulfillmentStage !== "dispatched") {
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
      message: isFinanceReverted ? "Finance-reverted — ready to mark item returned" : "Ready to mark returned",
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

  const entries = normalizeEntries(parsed.data);
  if (entries.length === 0) {
    return NextResponse.json({ error: "At least one order entry is required" }, { status: 400 });
  }

  for (const entry of entries) {
    if (!isReturnRemarkTemplateCode(entry.remarkTemplate)) {
      return NextResponse.json({ error: "Invalid remark template" }, { status: 400 });
    }
    if (!buildReturnRemarkText({ remarkTemplate: entry.remarkTemplate, customRemark: entry.customRemark })) {
      return NextResponse.json({ error: "Custom remark is required when template is Custom" }, { status: 400 });
    }
  }

  const companyId = auth.context!.user!.companyId;
  const actorUserId = auth.context!.user!.id;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const returnDate = resolveBulkReturnDate(parsed.data.returnDate);

  const previewRows = await buildPreviewRows(companyId, entries);
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

  const entryByReference = new Map(entries.map((entry) => [duplicateKey(entry.reference), entry]));
  const results: BulkReturnRow[] = [];
  for (const row of previewRows) {
    if (row.status !== "valid" || !row.orderId) {
      results.push(row);
      continue;
    }

    const entry = entryByReference.get(duplicateKey(row.input));
    if (!entry) {
      results.push({ ...row, status: "failed", message: "Missing entry metadata" });
      continue;
    }

    const returnRemark = buildReturnRemarkText({
      remarkTemplate: entry.remarkTemplate,
      customRemark: entry.customRemark,
    });
    if (!returnRemark) {
      results.push({ ...row, status: "missing_remark", message: "Custom remark is required" });
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

      const isFinanceReverted =
        order.fulfillmentStage === "delivery_complete" && !!order.revertedFromInvoiceCompleteAt;

      if (!isFinanceReverted && order.fulfillmentStage !== "dispatched") {
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

      if (isFinanceReverted) {
        // Finance-reverted path: update existing invoice_revert OrderReturn + trigger void approval
        const existingReturn = await prisma.orderReturn.findFirst({
          where: { orderId: order.id, companyId, remarkTemplate: "invoice_revert" },
          select: { id: true },
        });
        const orderLabel = order.name ?? order.orderNumber ?? order.shopifyOrderId;

        await prisma.order.update({
          where: { id: order.id },
          data: orderStageUpdate("returned_to_store", returnDate),
        });

        if (existingReturn) {
          await prisma.orderReturn.update({
            where: { id: existingReturn.id },
            data: { returnRemark },
          });
        }

        await createInvoiceRevertVoidApproval({
          companyId,
          orderId: order.id,
          invoiceLabel: orderLabel,
          revertedAt: order.revertedFromInvoiceCompleteAt!,
          companyLocationId: order.companyLocationId,
        });

        await writeAuditLog({
          companyId,
          actorUserId,
          module: "orders",
          action: "fulfillment_updated",
          entityType: "Order",
          entityId: order.id,
          summary: `Finance-reverted order ${orderLabel} marked returned to store — void approval sent`,
          beforeData: { fulfillmentStage: order.fulfillmentStage },
          afterData: { fulfillmentStage: "returned_to_store" },
          metadata: { action: "finance_revert_returned_to_store", bulk: true, input: row.input },
        });

        results.push({
          ...row,
          status: "processed",
          message: "Returned to store — void approval sent to finance",
          returnRemark,
          remarkTemplate: entry.remarkTemplate,
        });
      } else {
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
              returnRemark,
              remarkTemplate: entry.remarkTemplate,
              actionStatus: "pending",
            },
          });

          await tx.order.update({
            where: { id: order.id },
            data: {
              ...orderStageUpdate("returned_to_store", returnDate),
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
            returnRemark,
            remarkTemplate: entry.remarkTemplate,
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
          returnRemark,
          remarkTemplate: entry.remarkTemplate,
        });
      }
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

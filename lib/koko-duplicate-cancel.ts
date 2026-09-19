import {
  cancelPendingApprovalsForOrder,
  ORDER_PAYMENT_APPROVAL,
} from "@/lib/approval-workflow";
import { writeAuditLog } from "@/lib/audit-log";
import { createErpnextCreditNote, cancelErpnextSalesInvoice, setErpSalesInvoiceCancelKind } from "@/lib/erpnext-sync";
import {
  buildKokoDuplicateGroups,
  buildOrderItemFingerprint,
  phoneKeyForKokoDuplicate,
  type KokoDuplicateCandidate,
} from "@/lib/koko-duplicate-group";
import { isErpKokoOrder, isKokoPaymentGateway, KOKO_DUPLICATE_LOOKBACK_DAYS } from "@/lib/koko-order";
import { releaseKokoReferencesForOrder } from "@/lib/koko-approval-references";
import { prisma } from "@/lib/prisma";
import { isFullyPaidFinancialStatus } from "@/lib/return-cancel-completion";

export async function loadKokoDuplicateCandidatesForCompany(
  companyId: string,
): Promise<KokoDuplicateCandidate[]> {
  const since = new Date(Date.now() - KOKO_DUPLICATE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      createdAt: { gte: since },
      paymentGatewayPrimary: { contains: "koko", mode: "insensitive" },
    },
    select: {
      id: true,
      createdAt: true,
      customerPhone: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      kokoLinkGeneratedAt: true,
      financialStatus: true,
      cancelledAt: true,
      assignedMerchant: { select: { name: true, email: true } },
      lineItems: {
        select: {
          quantity: true,
          productItem: { select: { id: true, sku: true, productTitle: true } },
        },
      },
      approvalRequests: {
        where: { type: ORDER_PAYMENT_APPROVAL },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true },
      },
    },
    take: 500,
  });

  return orders
    .filter((o) => !o.cancelledAt && (o.financialStatus ?? "").toLowerCase() !== "voided")
    .map((o) => ({
      orderId: o.id,
      approvalId: o.approvalRequests[0]?.id ?? null,
      status:
        o.approvalRequests[0]?.status ??
        (o.kokoLinkGeneratedAt ? "awaiting_approval" : "awaiting_link_time"),
      createdAt: o.createdAt,
      customerPhone: o.customerPhone,
      phoneKey: phoneKeyForKokoDuplicate(o.customerPhone),
      fingerprint: buildOrderItemFingerprint(
        o.lineItems.map((li) => ({
          sku: li.productItem.sku,
          productItemId: li.productItem.id,
          quantity: li.quantity,
        })),
      ),
      kokoLinkGeneratedAt: o.kokoLinkGeneratedAt,
      invoiceNo: o.name ?? o.orderNumber ?? o.shopifyOrderId,
      merchantLabel: o.assignedMerchant?.name ?? o.assignedMerchant?.email ?? null,
      itemSummary: o.lineItems
        .map((li) => `${li.productItem.sku ?? li.productItem.productTitle}×${li.quantity}`)
        .join(", "),
    }));
}

export function enrichApprovalsWithKokoDuplicateGroups<
  T extends {
    id: string;
    orderId?: string | null;
    type: string;
    status: string;
    requiresKokoReference?: boolean;
    paymentTypeLabel?: string | null;
    requestNote?: string | null;
  },
>(
  approvals: T[],
  candidates: KokoDuplicateCandidate[],
): Array<
  T & {
    kokoLinkGeneratedAt?: string | null;
    duplicateGroupId?: string | null;
    duplicateGroupSize?: number;
    duplicateGroupMembers?: ReturnType<typeof buildKokoDuplicateGroups> extends Map<string, infer V> 
  ? V extends { duplicateGroupMembers: infer M }
    ? M
    : never
  : never;
  }
> {
  const groups = buildKokoDuplicateGroups(candidates);
  const byOrderId = new Map(candidates.map((c) => [c.orderId, c]));
  const groupByOrderId = new Map<string, string>();
  for (const [groupId, meta] of groups) {
    for (const m of meta.duplicateGroupMembers) {
      groupByOrderId.set(m.orderId, groupId);
    }
  }

  return approvals.map((a) => {
    const isKokoPayment =
      a.type === ORDER_PAYMENT_APPROVAL &&
      (a.requiresKokoReference ||
        (a.paymentTypeLabel ?? "").toLowerCase().includes("koko") ||
        (a.requestNote ?? "").toLowerCase().includes("koko"));
    if (!isKokoPayment || !a.orderId) {
      return {
        ...a,
        kokoLinkGeneratedAt: null,
        duplicateGroupId: null,
        duplicateGroupSize: 1,
        duplicateGroupMembers: [],
      };
    }
    const cand = byOrderId.get(a.orderId);
    const groupId = groupByOrderId.get(a.orderId) ?? null;
    const meta = groupId ? groups.get(groupId) : null;
    return {
      ...a,
      kokoLinkGeneratedAt: cand?.kokoLinkGeneratedAt?.toISOString() ?? null,
      duplicateGroupId: meta ? groupId : null,
      duplicateGroupSize: meta?.duplicateGroupSize ?? 1,
      duplicateGroupMembers: meta?.duplicateGroupMembers ?? [],
    };
  });
}

export async function cancelKokoDuplicateOrder(input: {
  companyId: string;
  actorUserId: string;
  approvalId: string;
  reason: string;
}): Promise<{ ok: true; erpOutcome: string } | { ok: false; status: number; error: string }> {
  const approval = await prisma.approvalRequest.findFirst({
    where: { id: input.approvalId, companyId: input.companyId },
    select: {
      id: true,
      type: true,
      status: true,
      orderId: true,
      order: {
        select: {
          id: true,
          name: true,
          orderNumber: true,
          shopifyOrderId: true,
          sourceName: true,
          paymentGatewayPrimary: true,
          paymentGatewayNames: true,
          financialStatus: true,
          cancelledAt: true,
          erpnextInvoiceId: true,
          companyLocationId: true,
          customerPhone: true,
          createdAt: true,
          lineItems: {
            select: {
              quantity: true,
              productItem: { select: { id: true, sku: true } },
            },
          },
          companyLocation: { include: { erpnextInstance: true } },
        },
      },
    },
  });

  if (!approval?.orderId || !approval.order) {
    return { ok: false, status: 404, error: "Approval or order not found" };
  }
  if (approval.type !== ORDER_PAYMENT_APPROVAL) {
    return { ok: false, status: 400, error: "Only order payment approvals can be cancelled as KOKO duplicates" };
  }
  if (!isErpKokoOrder(approval.order) && !isKokoPaymentGateway(approval.order)) {
    return { ok: false, status: 400, error: "Not a KOKO order" };
  }
  if (approval.order.cancelledAt || (approval.order.financialStatus ?? "").toLowerCase() === "voided") {
    return { ok: false, status: 409, error: "Order is already cancelled" };
  }

  const candidates = await loadKokoDuplicateCandidatesForCompany(input.companyId);
  const groups = buildKokoDuplicateGroups(candidates);
  let inGroup = false;
  for (const meta of groups.values()) {
    if (meta.duplicateGroupMembers.some((m) => m.orderId === approval.orderId)) {
      if (meta.duplicateGroupSize >= 2) inGroup = true;
      break;
    }
  }
  if (!inGroup) {
    return {
      ok: false,
      status: 409,
      error: "Order is not in a KOKO duplicate group (same phone + identical items within lookback)",
    };
  }

  const order = approval.order;
  const location = order.companyLocation;
  const hasUsableErpInvoice =
    Boolean(location) &&
    Boolean(order.erpnextInvoiceId) &&
    order.erpnextInvoiceId !== "pending" &&
    order.erpnextInvoiceId !== "pending_approval";
  const orderIsPaid = isFullyPaidFinancialStatus(order.financialStatus);

  if (hasUsableErpInvoice && location) {
    try {
      await setErpSalesInvoiceCancelKind(location, order.erpnextInvoiceId, "customer_cancel");
      if (orderIsPaid) {
        await createErpnextCreditNote(
          {
            id: order.id,
            name: order.name,
            orderNumber: order.orderNumber,
            erpnextInvoiceId: order.erpnextInvoiceId,
          },
          location,
        );
      } else {
        await cancelErpnextSalesInvoice(
          order.name ?? order.shopifyOrderId ?? order.id,
          location,
          { directInvoiceName: order.erpnextInvoiceId!, strict: true },
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        status: 502,
        error: orderIsPaid
          ? `ERP credit note failed — order not cancelled. ${msg}`
          : `ERP Sales Invoice cancel failed — order not cancelled. ${msg}`,
      };
    }
  }

  const now = new Date();
  await prisma.order.update({
    where: { id: order.id },
    data: {
      financialStatus: "voided",
      cancelledAt: now,
      cancelledById: input.actorUserId,
      cancelReason: input.reason,
      cancelKind: "customer_cancel",
    },
  });

  await cancelPendingApprovalsForOrder(order.id);
  if (approval.status === "approved") {
    await prisma.approvalRequest.updateMany({
      where: { id: approval.id, status: "approved" },
      data: {
        reviewNote: `Cancelled as KOKO duplicate: ${input.reason}`,
        updatedAt: now,
      },
    });
  }
  await releaseKokoReferencesForOrder(order.id);

  await writeAuditLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    module: "orders",
    action: "order_cancelled",
    entityType: "Order",
    entityId: order.id,
    summary: `Cancelled KOKO duplicate ${order.name ?? order.orderNumber ?? order.id}: ${input.reason}`,
    afterData: {
      financialStatus: "voided",
      cancelReason: input.reason,
      approvalId: approval.id,
      kokoDuplicate: true,
    },
  });

  return { ok: true, erpOutcome: hasUsableErpInvoice ? (orderIsPaid ? "credit_note" : "cancelled_si") : "os_only" };
}

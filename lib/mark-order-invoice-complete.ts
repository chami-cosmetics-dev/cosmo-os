import {
  DELIVERY_PAYMENT_APPROVAL,
  getFinancePaymentApprovalBlockReason,
  ORDER_PAYMENT_APPROVAL,
} from "@/lib/approval-workflow";
import { writeAuditLog } from "@/lib/audit-log";
import {
  clearOrderErpPeSyncFailure,
  ERP_PE_SYNC_MOP_ORDER_AUTO,
  markOrderErpPeSyncFailed,
} from "@/lib/failed-erp-pe-sync";
import {
  getErpConfig,
  mapDeliveryPaymentMethodToMop,
  resolveOrderPaymentMop,
  syncOrderDeliveryPaymentEntriesToErp,
} from "@/lib/erpnext-sync";
import { orderStageUpdate } from "@/lib/order-stage-timing";
import { approvalSplitCashCollectAmount } from "@/lib/approval-payment-split";
import { loadLatestOrderSplitPaymentLines } from "@/lib/order-split-payment";
import { prisma } from "@/lib/prisma";
import { shouldCommitInvoiceComplete } from "@/lib/rider-handover";

export { markOrderFinanciallyInvoiceComplete } from "@/lib/financial-invoice-complete";

export type MarkOrderInvoiceCompleteResult =
  | {
      success: true;
      ref: string;
      erpPeError?: string;
      peStatus?: "created" | "already_paid";
    }
  | { success: false; ref: string; error: string };

export function resolveInvoiceCompleteStamp(input: {
  invoiceCompleteAt: Date | null;
  invoiceCompleteById: string | null;
  now: Date;
  userId: string;
}): { invoiceCompleteAt: Date; invoiceCompleteById: string | null } {
  const actor = input.userId.trim() || null;
  return {
    invoiceCompleteAt: input.invoiceCompleteAt ?? input.now,
    invoiceCompleteById: input.invoiceCompleteById ?? actor,
  };
}

export async function markOrderInvoiceComplete(input: {
  companyId: string;
  orderId: string;
  userId: string;
  /** When omitted, PE uses the order's Vault payment method mapped to ERP. */
  modeOfPayment?: string;
  bulk?: boolean;
  /**
   * POS delivery close. Payment already sits on the Sales Invoice.
   * Skip the finance-approval gate and do not create a Payment Entry.
   */
  posAlreadyPaid?: boolean;
  /**
   * Rider handover close. Create the payment entry first and stamp invoice
   * complete only when that entry is created or the invoice is already paid.
   */
  commitOnlyWhenPaymentEntrySucceeds?: boolean;
}): Promise<MarkOrderInvoiceCompleteResult> {
  const now = new Date();
  const mopOverride = input.modeOfPayment?.trim() || undefined;

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    include: {
      companyLocation: { include: { erpnextInstance: true } },
      dispatchedByCourierService: { select: { name: true } },
    },
  });

  const ref = order?.name ?? order?.orderNumber ?? input.orderId;
  if (!order) {
    return { success: false, ref, error: "Order not found" };
  }
  if (!input.posAlreadyPaid) {
    const financeBlock = await getFinancePaymentApprovalBlockReason({
      id: order.id,
      paymentGatewayPrimary: order.paymentGatewayPrimary,
      paymentGatewayNames: order.paymentGatewayNames ?? [],
      erpnextInvoiceId: order.erpnextInvoiceId,
    });
    if (financeBlock) {
      return { success: false, ref, error: financeBlock };
    }
  }
  if (order.fulfillmentStage !== "delivery_complete") {
    return {
      success: false,
      ref,
      error: "Can only mark invoice complete when delivery is complete",
    };
  }
  const courierServiceName = order.dispatchedByCourierService?.name ?? null;
  const erpCfg = order.companyLocation?.erpnextInstance
    ? getErpConfig(order.companyLocation.erpnextInstance)
    : null;
  const cashToCollect = approvalSplitCashCollectAmount(
    await loadLatestOrderSplitPaymentLines(order.id),
  );
  const cashSplitMop =
    cashToCollect != null && erpCfg
      ? mapDeliveryPaymentMethodToMop(erpCfg, "cod", { courierServiceName }) ??
        (erpCfg.cashMop.trim() || null)
      : null;
  const resolvedMop =
    mopOverride ??
    cashSplitMop ??
    (erpCfg
      ? resolveOrderPaymentMop(erpCfg, order.paymentGatewayPrimary, order.paymentGatewayNames, {
          courierServiceName,
        })
      : null) ??
    undefined;

  const stamp = resolveInvoiceCompleteStamp({
    invoiceCompleteAt: order.invoiceCompleteAt,
    invoiceCompleteById: order.invoiceCompleteById,
    now,
    userId: input.userId,
  });
  const mopForFailure = resolvedMop ?? mopOverride ?? ERP_PE_SYNC_MOP_ORDER_AUTO;

  const stampInvoice = async () => {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          ...orderStageUpdate("invoice_complete", now),
          fulfillmentStatus: "fulfilled",
          financialStatus: "paid",
          invoiceCompleteAt: stamp.invoiceCompleteAt,
          invoiceCompleteById: stamp.invoiceCompleteById,
        },
      });

      await tx.approvalRequest.updateMany({
        where: {
          orderId: order.id,
          status: "pending",
          type: { in: [ORDER_PAYMENT_APPROVAL, DELIVERY_PAYMENT_APPROVAL] },
        },
        data: {
          status: "cancelled",
          reviewNote: "Invoice marked complete by finance.",
          updatedAt: now,
        },
      });
    });
  };

  const attemptPe = async (): Promise<{
    outcome: "created" | "already_paid" | "skipped" | "error";
    peStatus?: "created" | "already_paid";
    erpPeError?: string;
  }> => {
    if (input.posAlreadyPaid) {
      return { outcome: "already_paid", peStatus: "already_paid" };
    }
    if (!order.companyLocation) {
      const erpPeError = "Order has no company location — cannot create ERP payment entry";
      await markOrderErpPeSyncFailed(order.id, erpPeError, mopForFailure, now);
      return { outcome: "error", erpPeError };
    }
    try {
      const peResult = await syncOrderDeliveryPaymentEntriesToErp(
        {
          id: order.id,
          name: order.name,
          shopifyOrderId: order.shopifyOrderId,
          sourceName: order.sourceName,
          paymentGatewayPrimary: order.paymentGatewayPrimary,
          paymentGatewayNames: order.paymentGatewayNames,
          erpnextInvoiceId: order.erpnextInvoiceId,
          courierServiceName,
        },
        order.companyLocation,
        now,
        {
          mopNameOverride: mopOverride ?? cashSplitMop ?? undefined,
          requireMop: true,
          ...(cashToCollect != null ? { paidAmount: cashToCollect } : {}),
        },
      );
      if (peResult.outcome === "skipped") {
        const erpPeError = "ERP payment entry was skipped unexpectedly";
        await markOrderErpPeSyncFailed(order.id, erpPeError, mopForFailure, now);
        return { outcome: "skipped", erpPeError };
      }
      await clearOrderErpPeSyncFailure(order.id);
      return { outcome: peResult.outcome, peStatus: peResult.outcome };
    } catch (err) {
      const erpPeError = err instanceof Error ? err.message : String(err);
      console.error("[ERPNext] invoice-complete PE failed:", erpPeError);
      await markOrderErpPeSyncFailed(order.id, erpPeError, mopForFailure, now);
      return { outcome: "error", erpPeError };
    }
  };

  const writeCompleteAudit = async (pe: { erpPeError?: string; peStatus?: "created" | "already_paid" }) => {
    const orderNum = order.orderNumber ?? order.name ?? order.id;
    await writeAuditLog({
      companyId: input.companyId,
      actorUserId: input.userId.trim() || stamp.invoiceCompleteById,
      module: "orders",
      action: "fulfillment_updated",
      entityType: "Order",
      entityId: order.id,
      summary: pe.erpPeError
        ? `Marked invoice complete for ${orderNum} (ERP payment entry failed)`
        : pe.peStatus === "already_paid"
          ? `Marked invoice complete for ${orderNum} (ERP already paid)`
          : `Marked invoice complete for ${orderNum}`,
      beforeData: { fulfillmentStage: order.fulfillmentStage },
      afterData: { fulfillmentStage: "invoice_complete" },
      metadata: {
        action: "mark_invoice_complete",
        bulk: input.bulk ?? false,
        erpPeError: pe.erpPeError ?? null,
        peStatus: pe.peStatus ?? null,
        paymentMop: mopOverride ?? resolvedMop ?? null,
        paymentMopSource: mopOverride ? "override" : "order",
        posAlreadyPaid: input.posAlreadyPaid ?? false,
        commitOnlyWhenPaymentEntrySucceeds: input.commitOnlyWhenPaymentEntrySucceeds ?? false,
      },
    });
  };

  if (input.commitOnlyWhenPaymentEntrySucceeds) {
    const pe = await attemptPe();
    if (!shouldCommitInvoiceComplete(pe.outcome)) {
      return {
        success: false,
        ref,
        error: pe.erpPeError ?? "ERP payment entry was not created",
      };
    }
    await stampInvoice();
    await writeCompleteAudit(pe);
    return {
      success: true,
      ref,
      ...(pe.peStatus ? { peStatus: pe.peStatus } : {}),
    };
  }

  await stampInvoice();
  const pe = await attemptPe();
  await writeCompleteAudit(pe);

  return {
    success: true,
    ref,
    ...(pe.erpPeError ? { erpPeError: pe.erpPeError } : {}),
    ...(pe.peStatus ? { peStatus: pe.peStatus } : {}),
  };
}

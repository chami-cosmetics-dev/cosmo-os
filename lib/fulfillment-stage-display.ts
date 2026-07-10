export const FULFILLMENT_STAGE_LABELS: Record<string, string> = {
  cancelled: "Cancelled",
  order_received: "Order Received",
  sample_free_issue: "Sample/Free Issue",
  print: "Print",
  returned_to_store: "Returned to Store",
  returned: "Returned",
  ready_to_dispatch: "Ready to Dispatch",
  dispatched: "Dispatched",
  invoice_complete: "Invoice Complete",
  delivery_complete: "Delivery Complete",
  partial_void: "Partial Void",
  pending_approval: "Pending Approval",
  printed: "Printed",
};

export const FULFILLMENT_STAGE_COLORS: Record<string, string> = {
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  order_received: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  sample_free_issue: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  print: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  returned_to_store: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  returned: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  ready_to_dispatch: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  dispatched: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  delivery_complete: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  partial_void: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  invoice_complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  pending_approval: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  printed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

export type FulfillmentStageBadge = {
  key: string;
  label: string;
  className: string;
};

/** Package ready only counts when it happened after the last invoice print. */
export function isExplicitlyPackageReady(input: {
  packageReadyAt?: string | Date | null;
  lastPrintedAt?: string | Date | null;
}): boolean {
  if (!input.packageReadyAt) return false;
  if (!input.lastPrintedAt) return true;
  const readyAt = new Date(input.packageReadyAt).getTime();
  const printedAt = new Date(input.lastPrintedAt).getTime();
  if (!Number.isFinite(readyAt) || !Number.isFinite(printedAt)) return true;
  return readyAt > printedAt + 1000;
}

/** Package Ready milestone: manual mark after print, or implied once dispatched — not on print. */
export function isPackageReadyMilestoneComplete(input: {
  packageReadyAt?: string | Date | null;
  lastPrintedAt?: string | Date | null;
  dispatchedAt?: string | Date | null;
  packageOnHoldAt?: string | Date | null;
}): boolean {
  if (input.packageOnHoldAt) return true;
  if (isExplicitlyPackageReady(input)) return true;
  return !!input.dispatchedAt;
}

export function resolvePackageReadyMilestoneDate(input: {
  packageReadyAt?: string | Date | null;
  lastPrintedAt?: string | Date | null;
  dispatchedAt?: string | Date | null;
  packageOnHoldAt?: string | Date | null;
}): string | null {
  const raw = input.packageOnHoldAt
    ? input.packageOnHoldAt
    : isExplicitlyPackageReady(input)
      ? input.packageReadyAt ?? null
      : input.dispatchedAt ?? null;
  if (!raw) return null;
  return typeof raw === "string" ? raw : raw.toISOString();
}

function resolveListFulfillmentStage(input: {
  fulfillmentStage?: string | null;
  dispatchedAt?: string | Date | null;
}): string {
  const stage = input.fulfillmentStage ?? "order_received";
  if (
    input.dispatchedAt &&
    stage !== "dispatched" &&
    stage !== "delivery_complete" &&
    stage !== "invoice_complete" &&
    stage !== "returned" &&
    stage !== "returned_to_store"
  ) {
    return "dispatched";
  }
  return stage;
}

/** Orders list shows the current fulfillment stage only. Sample completion is tracked in order details timeline. */
export function getOrderListFulfillmentStageBadges(input: {
  fulfillmentStage?: string | null;
  financialStatus?: string | null;
  pendingPaymentApproval?: boolean;
  totalPrice?: string | number | null;
  printCount?: number | null;
  packageReadyAt?: string | Date | null;
  lastPrintedAt?: string | Date | null;
  dispatchedAt?: string | Date | null;
  revertedFromInvoiceCompleteAt?: string | Date | null;
}): FulfillmentStageBadge[] {
  if (input.financialStatus?.toLowerCase() === "voided") {
    return [{ key: "cancelled", label: FULFILLMENT_STAGE_LABELS.cancelled, className: FULFILLMENT_STAGE_COLORS.cancelled }];
  }

  const total = Number(input.totalPrice ?? 0);
  if (Number.isFinite(total) && total < 0) {
    return [
      {
        key: "credit_note",
        label: "Credit Note",
        className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      },
    ];
  }

  if (input.pendingPaymentApproval) {
    return [
      {
        key: "pending_approval",
        label: FULFILLMENT_STAGE_LABELS.pending_approval,
        className: FULFILLMENT_STAGE_COLORS.pending_approval,
      },
    ];
  }

  const stage = resolveListFulfillmentStage(input);

  // Finance-reverted from invoice_complete: item is still with customer, credit note pending physical return.
  if (stage === "delivery_complete" && input.revertedFromInvoiceCompleteAt) {
    return [
      {
        key: "partial_void",
        label: FULFILLMENT_STAGE_LABELS.partial_void,
        className: FULFILLMENT_STAGE_COLORS.partial_void,
      },
    ];
  }

  const printed = (input.printCount ?? 0) > 0;
  const packageReady = isExplicitlyPackageReady(input);

  if (
    stage === "ready_to_dispatch" &&
    printed &&
    !packageReady
  ) {
    return [
      {
        key: "printed",
        label: FULFILLMENT_STAGE_LABELS.printed,
        className: FULFILLMENT_STAGE_COLORS.printed,
      },
    ];
  }

  return [
    {
      key: stage,
      label: FULFILLMENT_STAGE_LABELS[stage] ?? stage,
      className: FULFILLMENT_STAGE_COLORS[stage] ?? "bg-secondary text-secondary-foreground",
    },
  ];
}

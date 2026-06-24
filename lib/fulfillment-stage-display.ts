export const FULFILLMENT_STAGE_LABELS: Record<string, string> = {
  order_received: "Order Received",
  sample_free_issue: "Sample/Free Issue",
  print: "Print",
  returned_to_store: "Returned to Store",
  returned: "Returned",
  ready_to_dispatch: "Ready to Dispatch",
  dispatched: "Dispatched",
  invoice_complete: "Invoice Complete",
  delivery_complete: "Delivery Complete",
  pending_approval: "Pending Approval",
};

export const FULFILLMENT_STAGE_COLORS: Record<string, string> = {
  order_received: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  sample_free_issue: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  print: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  returned_to_store: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  returned: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  ready_to_dispatch: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  dispatched: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  delivery_complete: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  invoice_complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  pending_approval: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

export type FulfillmentStageBadge = {
  key: string;
  label: string;
  className: string;
};

/**
 * Orders list fulfillment badges:
 * - Shopify/manual: order_received → Order Received; sample work → Sample/Free Issue; then Print onward.
 * - Bank/KOKO pending approval → Pending Approval (not in sample queue until approved).
 * - ERP + approved bank/KOKO after sample step: Sample/Free Issue + current stage (usually Print).
 */
export function getOrderListFulfillmentStageBadges(input: {
  fulfillmentStage?: string | null;
  pendingPaymentApproval?: boolean;
  sampleFreeIssueCompleteAt?: string | null;
  totalPrice?: string | number | null;
}): FulfillmentStageBadge[] {
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

  const stage = input.fulfillmentStage ?? "order_received";

  if (stage === "order_received") {
    return [
      {
        key: "order_received",
        label: FULFILLMENT_STAGE_LABELS.order_received,
        className: FULFILLMENT_STAGE_COLORS.order_received,
      },
    ];
  }

  if (stage === "sample_free_issue") {
    return [
      {
        key: "sample_free_issue",
        label: FULFILLMENT_STAGE_LABELS.sample_free_issue,
        className: FULFILLMENT_STAGE_COLORS.sample_free_issue,
      },
    ];
  }

  const badges: FulfillmentStageBadge[] = [];

  if (input.sampleFreeIssueCompleteAt) {
    badges.push({
      key: "sample_free_issue_done",
      label: FULFILLMENT_STAGE_LABELS.sample_free_issue,
      className: FULFILLMENT_STAGE_COLORS.sample_free_issue,
    });
  }

  badges.push({
    key: stage,
    label: FULFILLMENT_STAGE_LABELS[stage] ?? stage,
    className: FULFILLMENT_STAGE_COLORS[stage] ?? "bg-secondary text-secondary-foreground",
  });

  return badges;
}

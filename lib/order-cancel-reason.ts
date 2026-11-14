/** Prefer OS cancel text, then return-cancel remark, then return remark. */
export function resolveStoredCancelReason(input: {
  cancelReason?: string | null;
  returnCancelRemark?: string | null;
  returnRemark?: string | null;
}): string {
  for (const value of [input.cancelReason, input.returnCancelRemark, input.returnRemark]) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export type CancelReasonBackfillSource =
  | "order"
  | "return_cancel"
  | "return_remark"
  | "approval"
  | "shopify"
  | "erp_credit_note";

export type CancelReasonBackfillHit = {
  reason: string;
  source: CancelReasonBackfillSource;
};

function firstTrimmed(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/** Shopify REST cancel_reason on the stored order payload. */
export function shopifyCancelReasonFromPayload(raw: unknown): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  const top = raw as Record<string, unknown>;
  const nested =
    top.data && typeof top.data === "object" && !Array.isArray(top.data)
      ? (top.data as Record<string, unknown>)
      : null;
  for (const candidate of [top.cancel_reason, top.cancelReason, nested?.cancel_reason, nested?.cancelReason]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

/**
 * Fill empty Order.cancelReason from return/approval/Shopify, then generic ERP
 * credit-note label for returned-stage voids. Does not invent a reason otherwise.
 */
export function resolveCancelReasonBackfill(input: {
  cancelReason?: string | null;
  returnCancelRemark?: string | null;
  returnRemark?: string | null;
  approvalNote?: string | null;
  shopifyCancelReason?: string | null;
  fulfillmentStage?: string | null;
}): CancelReasonBackfillHit | null {
  const order = firstTrimmed(input.cancelReason);
  if (order) return { reason: order, source: "order" };
  const returnCancel = firstTrimmed(input.returnCancelRemark);
  if (returnCancel) return { reason: returnCancel, source: "return_cancel" };
  const returnRemark = firstTrimmed(input.returnRemark);
  if (returnRemark) return { reason: returnRemark, source: "return_remark" };
  const approval = firstTrimmed(input.approvalNote);
  if (approval) return { reason: approval, source: "approval" };
  const shopify = firstTrimmed(input.shopifyCancelReason);
  if (shopify) return { reason: shopify, source: "shopify" };
  if (input.fulfillmentStage === "returned") {
    return { reason: "ERP credit note", source: "erp_credit_note" };
  }
  return null;
}

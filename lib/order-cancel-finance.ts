import { extractOrderSeriesPrefix } from "@/lib/falcon-waybill-brand";

/** Online / ERP cancel requests CC this mailbox. */
export const ORDER_CANCEL_FINANCE_CC = ["ndilrukshi.cosmetics@outlook.com"] as const;

/** POS cancel requests also CC careers. */
export const POS_ORDER_CANCEL_FINANCE_CC = [
  "ndilrukshi.cosmetics@outlook.com",
  "careers@cosmetics.lk",
] as const;

const PRE_DISPATCH_CANCEL_STAGES = [
  "order_received",
  "sample_free_issue",
  "print",
  "ready_to_dispatch",
] as const;

export function orderCancelFinanceCc(isPos: boolean): string[] {
  return isPos ? [...POS_ORDER_CANCEL_FINANCE_CC] : [...ORDER_CANCEL_FINANCE_CC];
}

export function orderSeriesPrefixFromRefs(refs: Array<string | null | undefined>): string | null {
  for (const ref of refs) {
    if (!ref?.trim()) continue;
    const prefix = extractOrderSeriesPrefix(ref);
    if (prefix) return prefix;
  }
  return null;
}

export type CancelFinanceLocation = {
  id: string;
  name: string;
  shortName: string | null;
  manualInvoicePrefix: string | null;
  locationReference: string | null;
};

export type CancelPrefixAccount = {
  invoicePrefix: string;
  label: string;
};

function sameSeriesPrefix(candidate: string | null | undefined, wanted: string): boolean {
  if (!candidate?.trim()) return false;
  const normalized = extractOrderSeriesPrefix(candidate) ?? candidate.trim().replace(/^#/, "");
  return normalized.toUpperCase() === wanted.toUpperCase();
}

function locationMatchesAccountLabel(location: CancelFinanceLocation, label: string): boolean {
  const wanted = label.trim().toLowerCase();
  if (wanted.length < 2) return false;
  const name = location.name.trim().toLowerCase();
  const short = (location.shortName ?? "").trim().toLowerCase();
  if (short && short === wanted) return true;
  if (name === wanted) return true;
  return name.startsWith(wanted);
}

/**
 * Finance mailbox follows the order series prefix (110 → DTD) when a location
 * or CityPak/KOKO prefix account matches. Otherwise the order's company location.
 */
export function resolveCancelFinanceLocationId(input: {
  orderCompanyLocationId: string | null | undefined;
  orderRefs: Array<string | null | undefined>;
  locations: CancelFinanceLocation[];
  prefixAccounts: CancelPrefixAccount[];
}): string | null {
  const prefix = orderSeriesPrefixFromRefs(input.orderRefs);
  if (prefix) {
    const byManual = input.locations.find((loc) => sameSeriesPrefix(loc.manualInvoicePrefix, prefix));
    if (byManual) return byManual.id;

    const byReference = input.locations.find((loc) => sameSeriesPrefix(loc.locationReference, prefix));
    if (byReference) return byReference.id;

    const account = input.prefixAccounts.find((row) => sameSeriesPrefix(row.invoicePrefix, prefix));
    if (account) {
      const byLabel = input.locations.find((loc) => locationMatchesAccountLabel(loc, account.label));
      if (byLabel) return byLabel.id;
    }
  }

  return input.orderCompanyLocationId ?? null;
}

/** POS cancel is the cashier/merchant stored on the order, not the cancel permission. */
export function viewerCreatedPosOrder(
  viewerUserId: string | null | undefined,
  assignedMerchantId: string | null | undefined,
): boolean {
  if (!viewerUserId || !assignedMerchantId) return false;
  return viewerUserId === assignedMerchantId;
}

export function isAdminRole(roleNames: readonly string[] | null | undefined): boolean {
  if (!roleNames) return false;
  return roleNames.includes("admin") || roleNames.includes("super_admin");
}

/** Creator of that POS order, or an admin, can request cancel. */
export function canRequestPosOrderCancel(input: {
  viewerUserId: string | null | undefined;
  assignedMerchantId: string | null | undefined;
  roleNames: readonly string[] | null | undefined;
}): boolean {
  if (isAdminRole(input.roleNames)) return true;
  return viewerCreatedPosOrder(input.viewerUserId, input.assignedMerchantId);
}

export function merchantCanRequestOrderCancel(input: {
  isPos: boolean;
  fulfillmentStage: string;
  financialStatus: string | null | undefined;
  hasPendingCancelApproval: boolean;
}): boolean {
  if (input.hasPendingCancelApproval) return false;
  if ((input.financialStatus ?? "").trim().toLowerCase() === "voided") return false;
  if (input.isPos) return true;
  return (PRE_DISPATCH_CANCEL_STAGES as readonly string[]).includes(input.fulfillmentStage);
}

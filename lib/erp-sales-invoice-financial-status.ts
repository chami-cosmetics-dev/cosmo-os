export type ErpSalesInvoiceFinancialStatus =
  | "voided"
  | "paid"
  | "partially_paid"
  | "pending";

const UNPAID_ERP_STATUSES = new Set(["unpaid", "overdue", "draft"]);

function normalizeStatus(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function asMoney(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function paymentRowsReceived(
  payments: Array<{ amount?: number | null }> | null | undefined,
): number {
  if (!payments?.length) return 0;
  return payments.reduce((sum, row) => {
    const amount = asMoney(row.amount);
    return amount != null && amount > 0 ? sum + amount : sum;
  }, 0);
}

/** True when ERP recorded actual receipts (not a coupon / outstanding glitch). */
export function erpInvoiceHasReceivedPayment(input: {
  paidAmount?: number | null;
  payments?: Array<{ amount?: number | null }> | null;
}): boolean {
  const paid = asMoney(input.paidAmount);
  if (paid != null && paid > 0.005) return true;
  return paymentRowsReceived(input.payments) > 0.005;
}

/**
 * Map ERP Sales Invoice payment fields to Cosmo `financialStatus`.
 * Unpaid / Overdue stay pending even if outstanding &lt; grand_total
 * (COS5 coupon webhooks previously looked like part-pay).
 * `partially_paid` requires money received, not just an outstanding gap.
 */
export function resolveErpSalesInvoiceFinancialStatus(input: {
  docstatus?: number | null;
  isPos: boolean;
  status?: string | null;
  outstandingAmount?: number | null;
  grandTotal?: number | null;
  paidAmount?: number | null;
  payments?: Array<{ amount?: number | null }> | null;
}): ErpSalesInvoiceFinancialStatus {
  if (input.docstatus === 2) return "voided";

  const outstanding = asMoney(input.outstandingAmount);
  const isFullyPaid = outstanding != null && outstanding <= 0.005;
  if (input.isPos || isFullyPaid) return "paid";

  const erpStatus = normalizeStatus(input.status);
  if (UNPAID_ERP_STATUSES.has(erpStatus)) return "pending";

  const received = erpInvoiceHasReceivedPayment({
    paidAmount: input.paidAmount,
    payments: input.payments,
  });
  if (!received) return "pending";

  const grandTotal = asMoney(input.grandTotal);
  const outstandingShort =
    outstanding != null &&
    outstanding > 0.005 &&
    grandTotal != null &&
    outstanding < Math.abs(grandTotal) - 0.005;

  if (erpStatus === "partly paid" || outstandingShort) return "partially_paid";
  return "pending";
}

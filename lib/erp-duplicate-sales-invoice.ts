export type SalesInvoicePoCandidate = {
  name: string;
  outstanding_amount: number;
  grand_total: number;
  creation?: string | null;
};

const PLACEHOLDER_INVOICE_IDS = new Set(["pending", "pending_approval"]);

/** A cancelled SI voids the OS order only when it is the invoice that order is linked to. */
export function shouldVoidOrderForCancelledSalesInvoice(input: {
  cancelledInvoiceName: string;
  linkedInvoiceId?: string | null;
}): boolean {
  const linked = input.linkedInvoiceId?.trim() ?? "";
  if (!linked || PLACEHOLDER_INVOICE_IDS.has(linked)) return true;
  return linked === input.cancelledInvoiceName.trim();
}

function money(value: number): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function sameMoney(left: number, right: number): boolean {
  return Math.abs(money(left) - money(right)) < 0.02;
}

function byAgeThenName(left: SalesInvoicePoCandidate, right: SalesInvoicePoCandidate): number {
  const created = (left.creation ?? "").localeCompare(right.creation ?? "");
  if (created !== 0) return created;
  return left.name.localeCompare(right.name);
}

/** Paid invoice for this PO. If none are paid, the earliest submitted invoice. */
export function selectCanonicalSalesInvoice<T extends SalesInvoicePoCandidate>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  const paid = rows.filter((row) => money(row.outstanding_amount) <= 0);
  const pool = paid.length > 0 ? paid : rows;
  return [...pool].sort(byAgeThenName)[0] ?? null;
}

/**
 * Fully unpaid copies of a paid invoice with the same total.
 * Partial payments and a second paid invoice are left alone.
 */
export function unpaidDuplicateSalesInvoices<T extends SalesInvoicePoCandidate>(rows: T[]): T[] {
  const canonical = selectCanonicalSalesInvoice(rows);
  if (!canonical || money(canonical.outstanding_amount) > 0) return [];

  const paidTotal = money(canonical.grand_total);
  return rows.filter((row) => {
    if (row.name === canonical.name) return false;
    const outstanding = money(row.outstanding_amount);
    const grand = money(row.grand_total);
    if (outstanding <= 0) return false;
    if (!sameMoney(outstanding, grand)) return false;
    return sameMoney(grand, paidTotal);
  });
}

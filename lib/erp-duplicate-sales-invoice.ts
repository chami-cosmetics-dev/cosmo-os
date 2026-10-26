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
export function selectCanonicalSalesInvoice<T extends SalesInvoicePoCandidate>(
  rows: T[],
  preferNames?: ReadonlySet<string>,
): T | null {
  if (rows.length === 0) return null;
  const paid = rows.filter((row) => money(row.outstanding_amount) <= 0);
  const pool = paid.length > 0 ? paid : rows;
  if (preferNames && preferNames.size > 0) {
    const preferred = pool.filter((row) => preferNames.has(row.name));
    if (preferred.length > 0) {
      return [...preferred].sort(byAgeThenName)[0] ?? null;
    }
  }
  return [...pool].sort(byAgeThenName)[0] ?? null;
}

export type SalesInvoicePoDedupeRow = SalesInvoicePoCandidate & {
  po_no?: string | null;
  company?: string | null;
  is_return?: number | boolean | null;
  net_total?: number | string | null;
};

function isReturnInvoice(row: SalesInvoicePoDedupeRow): boolean {
  if (row.is_return === 1 || row.is_return === true) return true;
  const net = Number(row.net_total ?? 0);
  return Number.isFinite(net) && net < 0;
}

function duplicatePoKey(row: SalesInvoicePoDedupeRow): string | null {
  if (isReturnInvoice(row)) return null;
  const poNo = (row.po_no ?? "").trim();
  if (!poNo) return null;
  return `${(row.company ?? "").trim().toLowerCase()}::${poNo}`;
}

/**
 * One submitted sale per company + po_no. Returns and invoices with no PO stay.
 * Prefers a paid invoice; if several are paid, prefers `preferNames` (Vault-linked SI).
 */
export function keepCanonicalSalesInvoicesByPo<T extends SalesInvoicePoDedupeRow>(
  rows: T[],
  preferNames?: ReadonlySet<string>,
): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = duplicatePoKey(row);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const drop = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const canonical = selectCanonicalSalesInvoice(group, preferNames);
    for (const row of group) {
      if (row.name && row.name !== canonical?.name) drop.add(row.name);
    }
  }
  if (drop.size === 0) return rows;
  return rows.filter((row) => !drop.has(row.name));
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

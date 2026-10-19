export type SupplementLine = {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: string;
  lineAmount: string;
  itemId: null;
};

export function supplementInvoiceKey(sourceRef: string, invoiceNo: string): string {
  return `vsupp:${sourceRef}|${invoiceNo}`;
}

export function supplementLineId(adaptInvoiceKey: string, itemCode: string): string {
  return `${adaptInvoiceKey}:${itemCode}`;
}

export function sumLineAmounts(lines: Array<{ lineAmount: string | number }>): number {
  let total = 0;
  for (const line of lines) {
    const amount = typeof line.lineAmount === "number" ? line.lineAmount : Number(line.lineAmount);
    if (Number.isFinite(amount)) total += amount;
  }
  return roundMoney(total);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function asSupplementLine(raw: unknown): SupplementLine | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<SupplementLine>;
  const itemCode = typeof item.itemCode === "string" ? item.itemCode.trim() : "";
  const itemName = typeof item.itemName === "string" ? item.itemName.trim() : "";
  const id = typeof item.id === "string" ? item.id : "";
  const quantity = typeof item.quantity === "number" ? item.quantity : Number(item.quantity);
  if (!itemCode || !itemName || !id || !Number.isFinite(quantity)) return null;
  const unitPrice = item.unitPrice == null ? "0" : String(item.unitPrice);
  const lineAmount =
    item.lineAmount == null || String(item.lineAmount).trim() === ""
      ? String(roundMoney(quantity * Number(unitPrice)))
      : String(item.lineAmount);
  return {
    id,
    itemCode,
    itemName,
    quantity,
    unitPrice,
    lineAmount,
    itemId: null,
  };
}

export function readStoredSupplementLines(raw: unknown): SupplementLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: SupplementLine[] = [];
  for (const entry of raw) {
    const line = asSupplementLine(entry);
    if (line) lines.push(line);
  }
  return lines;
}

export type InvoiceMergeResult = {
  lines: SupplementLine[];
  ttlAmount: number;
  added: number;
  updated: number;
};

/**
 * Replace a stored line when itemCode matches. Lines omitted from this upload stay.
 * Invoice total is the sum of the stored supplement lines after the merge.
 */
export function mergeSupplementLines(
  existing: SupplementLine[],
  incoming: SupplementLine[],
): InvoiceMergeResult {
  const lines = existing.map((line) => ({ ...line }));
  const indexByCode = new Map<string, number>();
  lines.forEach((line, index) => {
    indexByCode.set(line.itemCode, index);
  });

  let added = 0;
  let updated = 0;
  for (const line of incoming) {
    const at = indexByCode.get(line.itemCode);
    if (at == null) {
      indexByCode.set(line.itemCode, lines.length);
      lines.push(line);
      added += 1;
    } else {
      lines[at] = line;
      updated += 1;
    }
  }

  return {
    lines,
    ttlAmount: sumLineAmounts(lines),
    added,
    updated,
  };
}

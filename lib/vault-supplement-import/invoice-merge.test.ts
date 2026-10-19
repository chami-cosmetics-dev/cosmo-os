import { describe, expect, it } from "vitest";

import {
  mergeSupplementLines,
  supplementInvoiceKey,
  supplementLineId,
  type SupplementLine,
} from "@/lib/vault-supplement-import/invoice-merge";

function line(itemCode: string, quantity: number, unitPrice: number, amount: number): SupplementLine {
  const key = supplementInvoiceKey("COSMO-ORD-1", "INV-1");
  return {
    id: supplementLineId(key, itemCode),
    itemCode,
    itemName: itemCode,
    quantity,
    unitPrice: String(unitPrice),
    lineAmount: String(amount),
    itemId: null,
  };
}

describe("invoice merge", () => {
  it("totals only the supplement lines, not a mixed cosmetics invoice", () => {
    const merged = mergeSupplementLines([], [line("SV-1", 2, 15000, 30000), line("SV-2", 1, 500, 500)]);
    expect(merged.ttlAmount).toBe(30500);
    expect(merged.added).toBe(2);
    expect(merged.lines).toHaveLength(2);
  });

  it("updates the matching line on a second apply and keeps a line omitted from the file", () => {
    const first = mergeSupplementLines([], [line("SV-1", 2, 100, 200), line("SV-2", 1, 50, 50)]);
    const second = mergeSupplementLines(first.lines, [line("SV-1", 4, 100, 400)]);
    expect(second.updated).toBe(1);
    expect(second.added).toBe(0);
    expect(second.lines.map((item) => item.itemCode)).toEqual(["SV-1", "SV-2"]);
    expect(second.lines[0]?.quantity).toBe(4);
    expect(second.ttlAmount).toBe(450);
  });
});

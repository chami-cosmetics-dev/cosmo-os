import { describe, expect, it } from "vitest";

import { accumulateSalesLines, salesQtyForSku } from "@/lib/vault-osf/erp-sales";

const bounds = { start: "2026-06-01", end: "2026-06-30" };

describe("vault OSF sales reducer", () => {
  it("nets return qty and skips cancelled / Origins Online", () => {
    const activity = accumulateSalesLines(
      [
        { item_code: "NW004-2", qty: 3, company: "SupplementVault.lk", posting_date: "2026-06-02", docstatus: 1 },
        { item_code: "NW004-2", qty: -1, company: "SupplementVault.lk", posting_date: "2026-06-05", docstatus: 1 },
        { item_code: "NW004-2", qty: 9, company: "SupplementVault.lk", posting_date: "2026-06-06", docstatus: 2 },
        { item_code: "NW004-2", qty: 4, company: "Origins Online", posting_date: "2026-06-03", docstatus: 1 },
      ],
      bounds,
      "SupplementVault.lk",
    );
    expect(activity.hadDocuments).toBe(true);
    expect(salesQtyForSku(activity, "NW004-2")).toBe(2);
  });

  it("returns null for a month with no company invoices (history not loaded)", () => {
    const activity = accumulateSalesLines([], bounds, "SupplementVault.lk");
    expect(activity.hadDocuments).toBe(false);
    expect(salesQtyForSku(activity, "NW004-2")).toBeNull();
  });

  it("returns 0 when company had invoices but this SKU did not sell", () => {
    const activity = accumulateSalesLines(
      [{ item_code: "OTHER", qty: 1, company: "SupplementVault.lk", posting_date: "2026-06-02", docstatus: 1 }],
      bounds,
      "SupplementVault.lk",
    );
    expect(salesQtyForSku(activity, "NW004-2")).toBe(0);
  });
});

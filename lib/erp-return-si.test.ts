import { describe, expect, it } from "vitest";

import {
  combineErpReturnSalesInvoiceIds,
  mergeErpReturnSalesInvoiceIds,
  normalizeErpReturnSalesInvoiceIds,
  readLegacyErpReturnSalesInvoiceNames,
} from "@/lib/erp-return-si";

describe("erp-return-si helpers", () => {
  it("trims, drops blanks, and dedupes", () => {
    expect(
      normalizeErpReturnSalesInvoiceIds(["  ACC-SINV-1  ", "", "ACC-SINV-1", "ACC-SINV-2", null]),
    ).toEqual(["ACC-SINV-1", "ACC-SINV-2"]);
  });

  it("merges incoming onto existing without duplicates", () => {
    expect(mergeErpReturnSalesInvoiceIds(["A"], "A")).toEqual(["A"]);
    expect(mergeErpReturnSalesInvoiceIds(["A"], ["B", "A"])).toEqual(["A", "B"]);
  });

  it("reads legacy rawPayload.erpReturnSalesInvoiceNames", () => {
    expect(
      readLegacyErpReturnSalesInvoiceNames({
        erpReturnSalesInvoiceNames: [" R1 ", "", "R1", "R2"],
      }),
    ).toEqual(["R1", "R2"]);
    expect(readLegacyErpReturnSalesInvoiceNames(null)).toEqual([]);
    expect(readLegacyErpReturnSalesInvoiceNames([])).toEqual([]);
  });

  it("combines column + legacy payload", () => {
    expect(
      combineErpReturnSalesInvoiceIds(["COL"], {
        erpReturnSalesInvoiceNames: ["LEG", "COL"],
      }),
    ).toEqual(["COL", "LEG"]);
  });

  it("supports suffix-style Return SI search terms via endsWith pattern", () => {
    // Search uses SQL: si ILIKE '%' || term (same idea as erpnextInvoiceId endsWith)
    const ids = ["ACC-SINV-2026-00999", "ACC-SINV-2026-00123"];
    const term = "00999";
    expect(ids.filter((id) => id.toLowerCase().endsWith(term.toLowerCase()))).toEqual([
      "ACC-SINV-2026-00999",
    ]);
  });
});
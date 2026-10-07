import { describe, expect, it } from "vitest";

import { buildStandardPriceMismatches } from "@/lib/stock-price-missing/standard-mismatch";

describe("buildStandardPriceMismatches", () => {
  it("lists every SKU whose Standard Selling differs, stock ignored", () => {
    const rows = buildStandardPriceMismatches({
      standard1: { "SKU-1": "100.00", "SKU-2": "50.00", "sku-3": "10.00", B: "10.00" },
      standard2: { "sku-1": "120.00", "SKU-2": "50.00", "SKU-3": "11.00" },
      nameBySku: new Map([["SKU-1", "Cream"]]),
    });

    expect(rows.map((row) => row.sku)).toEqual(["SKU-1", "sku-3"]);
    expect(rows[0]).toEqual({
      sku: "SKU-1",
      itemName: "Cream",
      erp1Rate: "100.00",
      erp2Rate: "120.00",
      diff: "-20.00",
    });
    expect(rows[1]).toMatchObject({
      itemName: "sku-3",
      diff: "-1.00",
    });
  });
});
import { describe, expect, it } from "vitest";

import { catalogForWarehouses } from "@/lib/store-stock-count/warehouse-items";

function row(item_code: string) {
  return {
    item_code,
    item_name: item_code,
    description: "",
    barcode: "",
  };
}

describe("catalogForWarehouses", () => {
  it("keeps only enabled catalog items with a bin in the selected warehouse", () => {
    const binQty = new Map<string, Map<string, number>>([
      ["SV-1", new Map([["Main Warehouse - SV-1", 4]])],
      ["AE-1", new Map([["Main Warehouse - AE", 2]])],
      ["ZERO", new Map([["Main Warehouse - SV-1", 0]])],
      ["DISABLED", new Map([["Main Warehouse - SV-1", 1]])],
    ]);

    const out = catalogForWarehouses(
      [row("SV-1"), row("AE-1"), row("NO-BIN"), row("ZERO")],
      binQty,
      ["Main Warehouse - SV-1"],
    );

    expect(out.map((item) => item.item_code).sort()).toEqual(["SV-1", "ZERO"]);
  });

  it("drops TEST and OSF remove SKUs even when they have bins", () => {
    const binQty = new Map<string, Map<string, number>>([
      ["KEEP", new Map([["Main Warehouse - SV-1", 1]])],
      ["TEST", new Map([["Main Warehouse - SV-1", 0]])],
      ["SW002-1", new Map([["Main Warehouse - SV-1", 2]])],
    ]);

    const out = catalogForWarehouses(
      [row("KEEP"), row("TEST"), row("SW002-1")],
      binQty,
      ["Main Warehouse - SV-1"],
    );

    expect(out.map((item) => item.item_code)).toEqual(["KEEP"]);
  });

  it("unions items when multiple warehouses are selected", () => {
    const binQty = new Map<string, Map<string, number>>([
      ["A", new Map([["Main Warehouse - Origins", 1]])],
      ["B", new Map([["OGF Shop - Origins", 3]])],
    ]);

    const out = catalogForWarehouses(
      [row("A"), row("B")],
      binQty,
      ["Main Warehouse - Origins", "OGF Shop - Origins"],
    );

    expect(out.map((item) => item.item_code).sort()).toEqual(["A", "B"]);
  });

  it("returns empty when no warehouses selected", () => {
    const binQty = new Map<string, Map<string, number>>([
      ["SV-1", new Map([["Main Warehouse - SV-1", 4]])],
    ]);
    expect(catalogForWarehouses([row("SV-1")], binQty, [])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import {
  findReceiptLine,
  receiptVariance,
  shopScopeIsEmpty,
  transferVisibleToShop,
  warehouseMatchesOutlet,
} from "@/lib/material-transfer/receive";

describe("shop scope", () => {
  it("matches a cosmetics shop warehouse from the outlet name", () => {
    expect(warehouseMatchesOutlet("GCC Shop Warehouse - Cosmo", "GCC")).toBe(true);
    expect(warehouseMatchesOutlet("Pepiliyana Shop Warehouse - Cosmo", "GCC")).toBe(false);
    expect(warehouseMatchesOutlet("Shop Warehouse - Chami", "Chami")).toBe(true);
    expect(warehouseMatchesOutlet("Main Warehouse - Chami", "shop")).toBe(false);
  });

  it("shows a transfer for the outlet or an explicit warehouse", () => {
    expect(
      transferVisibleToShop("GCC Shop Warehouse - Cosmo", {
        explicitWarehouses: [],
        outletName: "GCC",
      }),
    ).toBe(true);
    expect(
      transferVisibleToShop("Shop Warehouse - AJS", {
        explicitWarehouses: ["Shop Warehouse - AJS"],
        outletName: null,
      }),
    ).toBe(true);
    expect(
      transferVisibleToShop("Shop Warehouse - DRO", {
        explicitWarehouses: ["Shop Warehouse - AJS"],
        outletName: "GCC",
      }),
    ).toBe(false);
    expect(shopScopeIsEmpty({ explicitWarehouses: [], outletName: "  " })).toBe(true);
  });
});

describe("receipt count", () => {
  const lines = [
    { itemCode: "NEH09_1", barcode: "062600656827", sentQty: 2, receivedQty: 1 },
    { itemCode: "ARE01_1", barcode: "", sentQty: 1, receivedQty: 0 },
  ];

  it("finds a line by barcode or sku and reports qty differences", () => {
    expect(findReceiptLine(lines, "062600656827")?.itemCode).toBe("NEH09_1");
    expect(findReceiptLine(lines, "are01_1")?.itemCode).toBe("ARE01_1");
    expect(findReceiptLine(lines, "NOPE")).toBeUndefined();
    expect(receiptVariance(lines)).toEqual({ mismatchCount: 2, shortUnits: 2, overUnits: 0 });
  });
});

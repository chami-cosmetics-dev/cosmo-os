import { describe, expect, it } from "vitest";

import {
  findReceiptLine,
  promoteLine,
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
    expect(warehouseMatchesOutlet("Shop Warehouse - MNK", "Cool Planet")).toBe(false);
    expect(warehouseMatchesOutlet("Shop Warehouse - Chami", "GCC")).toBe(false);
    expect(warehouseMatchesOutlet("GCC Shop Warehouse - Cosmo", "Galle")).toBe(true);
    expect(warehouseMatchesOutlet("Pepiliyana Shop Warehouse - Cosmo", "Galle")).toBe(false);
  });

  it("shows an ERP2 company transfer only to the mapped outlet", () => {
    const see = (warehouse: string, outletName: string) =>
      transferVisibleToShop(warehouse, { explicitWarehouses: [], outletName });
    expect(see("Shop Warehouse - MNK", "Cool Planet")).toBe(true);
    expect(see("Main Warehouse - MNK", "Cool Planet Nugegoda")).toBe(true);
    expect(see("Shop Warehouse - MNK", "GCC")).toBe(false);
    expect(see("Shop Warehouse - LMJ", "Pepiliyana")).toBe(true);
    expect(see("Shop Warehouse - AJS", "Kiribathgoda")).toBe(true);
    expect(see("Shop Warehouse - Chami", "GCC")).toBe(true);
    expect(see("Shop Warehouse - Chami", "Galle")).toBe(true);
    expect(see("Shop Warehouse - DTD", "Thilakma Negombo")).toBe(true);
    expect(see("Shop Warehouse - DTD", "Thilakma Negmbo")).toBe(true);
    expect(see("Shop Warehouse - SPK", "Nittabuwa")).toBe(true);
    expect(see("Shop Warehouse - SPK", "Nittambuwa")).toBe(true);
    expect(see("Shop Warehouse - LWK", "OGF")).toBe(true);
    expect(see("Shop Warehouse - DRO", "Maharagama")).toBe(true);
    expect(see("Main Warehouse - DRO", "Maharagama")).toBe(true);
    expect(see("Shop Warehouse - DRO", "GCC")).toBe(false);
    expect(see("Shop Warehouse - MNK", "Maharagama")).toBe(false);
    expect(see("Shop Warehouse - LMJ", "Kiribathgoda")).toBe(false);
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

describe("scanned line order", () => {
  const lines = [
    { id: "a", itemCode: "A" },
    { id: "b", itemCode: "B" },
    { id: "c", itemCode: "C" },
  ];

  it("moves the scanned line to the top and leaves the rest in place", () => {
    expect(promoteLine(lines, "c").map((line) => line.id)).toEqual(["c", "a", "b"]);
    expect(promoteLine(lines, "a")).toBe(lines);
    expect(promoteLine(lines, null)).toBe(lines);
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

import { describe, expect, it } from "vitest";

import { buildCosmeticsStockReport, type StockBalanceRow } from "@/lib/cosmetics-stock-comparer";

function row(input: Partial<StockBalanceRow>): StockBalanceRow {
  return {
    Item: input.Item ?? "SKU-1",
    "Item Name": input["Item Name"] ?? "Product",
    Company: input.Company ?? "Cosmetics.lk",
    Warehouse: input.Warehouse ?? "Main Warehouse - Cosmo",
    "Balance Qty": input["Balance Qty"] ?? 0,
  };
}

describe("buildCosmeticsStockReport", () => {
  it("includes items where main warehouse stock is at or below threshold", () => {
    const report = buildCosmeticsStockReport(
      [
        row({ Item: "LOW", "Balance Qty": 0 }),
        row({ Item: "HIGH", "Balance Qty": 5 }),
      ],
      0,
    );

    expect(report.map((r) => r.SKU)).toEqual(["LOW"]);
  });

  it("ignores all warehouses rows and uses shop warehouse over main warehouse", () => {
    const report = buildCosmeticsStockReport([
      row({ Item: "SKU-1", "Balance Qty": 0 }),
      row({
        Item: "SKU-1",
        Company: "Pepiliyana",
        Warehouse: "All Warehouses - LMJ",
        "Balance Qty": 99,
      }),
      row({
        Item: "SKU-1",
        Company: "LMJ",
        Warehouse: "Pepiliyana Main Warehouse",
        "Balance Qty": 3,
      }),
      row({
        Item: "SKU-1",
        Company: "LMJ",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 7,
      }),
    ]);

    expect(report).toMatchObject([
      {
        SKU: "SKU-1",
        "Priority 2 Warehouse(s)": "Pepiliyana",
        "Priority 2 Qty": 7,
        "Stock Available Elsewhere": "Yes",
      },
    ]);
  });

  it("sorts rows with available stock first and then by SKU", () => {
    const report = buildCosmeticsStockReport([
      row({ Item: "B", "Balance Qty": 0 }),
      row({ Item: "A", "Balance Qty": 0 }),
      row({ Item: "B", Company: "Cool Planet", Warehouse: "Cool Planet Shop Warehouse", "Balance Qty": 2 }),
    ]);

    expect(report.map((r) => r.SKU)).toEqual(["B", "A"]);
  });

  it("groups outlet rows by warehouse-derived outlet when company is the same", () => {
    const report = buildCosmeticsStockReport(
      [
        row({ Item: "ACN01_1", "Item Name": "Acnes Sealing Gel Pimple Treatment 9g", "Balance Qty": 2 }),
        row({
          Item: "ACN01_1",
          "Item Name": "Acnes Sealing Gel Pimple Treatment 9g",
          Company: "Cosmetics.lk",
          Warehouse: "Cool Planet Nugegoda Shop Warehouse",
          "Balance Qty": 2,
        }),
        row({
          Item: "ACN01_1",
          "Item Name": "Acnes Sealing Gel Pimple Treatment 9g",
          Company: "Cosmetics.lk",
          Warehouse: "GCC Shop Warehouse",
          "Balance Qty": 0,
        }),
        row({
          Item: "ACN01_1",
          "Item Name": "Acnes Sealing Gel Pimple Treatment 9g",
          Company: "Cosmetics.lk",
          Warehouse: "Kiribathgoda Shop Warehouse",
          "Balance Qty": 2,
        }),
        row({
          Item: "ACN01_1",
          "Item Name": "Acnes Sealing Gel Pimple Treatment 9g",
          Company: "Cosmetics.lk",
          Warehouse: "Maharagama Shop Warehouse",
          "Balance Qty": 1,
        }),
        row({
          Item: "ACN01_1",
          "Item Name": "Acnes Sealing Gel Pimple Treatment 9g",
          Company: "Cosmetics.lk",
          Warehouse: "OGF Shop Warehouse",
          "Balance Qty": 0,
        }),
        row({
          Item: "ACN01_1",
          "Item Name": "Acnes Sealing Gel Pimple Treatment 9g",
          Company: "Cosmetics.lk",
          Warehouse: "Pepiliyana Shop Warehouse",
          "Balance Qty": 4,
        }),
      ],
      2,
    );

    expect(report).toMatchObject([
      {
        SKU: "ACN01_1",
        "Priority 2 Warehouse(s)": "Kiribathgoda, Pepiliyana",
        "Priority 2 Qty": 6,
        "Priority 3 Warehouse(s)": "Cool Planet, Maharagama",
        "Priority 3 Qty": 3,
        "Stock Available Elsewhere": "Yes",
      },
    ]);
  });

  it("uses selected warehouse tokens for priority over company display", () => {
    const report = buildCosmeticsStockReport([
      row({ Item: "SKU-1", "Balance Qty": 0 }),
      row({
        Item: "SKU-1",
        Company: "Chami Trading",
        Warehouse: "Shop Warehouse - SPK",
        "Balance Qty": 7,
      }),
    ]);

    expect(report).toMatchObject([
      {
        SKU: "SKU-1",
        "Priority 1 Warehouse(s)": "SPK",
        "Priority 1 Qty": 7,
      },
    ]);
  });
});

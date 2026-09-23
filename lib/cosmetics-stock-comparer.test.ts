import { describe, expect, it } from "vitest";

import {
  buildBrandWarehouseViolations,
  buildCosmeticsStockReport,
  type StockBalanceRow,
} from "@/lib/cosmetics-stock-comparer";

function row(input: Partial<StockBalanceRow>): StockBalanceRow {
  return {
    Item: input.Item ?? "SKU-1",
    "Item Name": input["Item Name"] ?? "Product",
    Company: input.Company ?? "Cosmetics.lk",
    Warehouse: input.Warehouse ?? "Main Warehouse - Cosmo",
    "Balance Qty": input["Balance Qty"] ?? 0,
    "__ERP Source": input["__ERP Source"] ?? "",
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

  it("reports ERP1-only brands found in ERP2 stock", () => {
    const violations = buildBrandWarehouseViolations([
      row({
        Item: "ACNES-1",
        "Item Name": "Acnes Creamy Wash",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 3,
        "__ERP Source": "ERP1",
      }),
      row({
        Item: "ACNES-1",
        "Item Name": "Acnes Creamy Wash",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 2,
        "__ERP Source": "ERP2",
      }),
      row({
        Item: "ACNES-1",
        "Item Name": "Acnes Creamy Wash",
        Warehouse: "All Warehouses - Cosmo",
        "Balance Qty": 10,
        "__ERP Source": "ERP2",
      }),
      row({
        Item: "HL-1",
        "Item Name": "Hada Labo Lotion",
        Warehouse: "Cool Planet Shop Warehouse",
        "Balance Qty": 1,
        "__ERP Source": "ERP2",
      }),
    ]);

    expect(violations).toEqual([
      {
        SKU: "ACNES-1",
        "Product Title": "Acnes Creamy Wash",
        Brand: "Acnes",
        "ERP Source": "ERP2",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 2,
        Rule: "Brand should only appear in ERP1",
      },
      {
        SKU: "HL-1",
        "Product Title": "Hada Labo Lotion",
        Brand: "Hada Labo",
        "ERP Source": "ERP2",
        Warehouse: "Cool Planet Shop Warehouse",
        "Balance Qty": 1,
        Rule: "Brand should only appear in ERP1",
      },
    ]);
  });

  it("reports ERP2-only brands found in ERP1 stock", () => {
    const violations = buildBrandWarehouseViolations([
      row({
        Item: "REV-1",
        "Item Name": "Revlon Lipstick",
        Warehouse: "Main Warehouse - Cosmo",
        "Balance Qty": 4,
        "__ERP Source": "ERP1",
      }),
      row({
        Item: "REV-1",
        "Item Name": "Revlon Lipstick",
        Warehouse: "Cool Planet Shop Warehouse",
        "Balance Qty": 8,
        "__ERP Source": "ERP2",
      }),
      row({
        Item: "MAY-1",
        "Item Name": "Maybeline Mascara",
        Warehouse: "Main Warehouse - Cosmo",
        "Balance Qty": 0,
        "__ERP Source": "ERP1",
      }),
    ]);

    expect(violations).toEqual([
      {
        SKU: "REV-1",
        "Product Title": "Revlon Lipstick",
        Brand: "Revlon",
        "ERP Source": "ERP1",
        Warehouse: "Main Warehouse - Cosmo",
        "Balance Qty": 4,
        Rule: "Brand should only appear in ERP2",
      },
    ]);
  });
});

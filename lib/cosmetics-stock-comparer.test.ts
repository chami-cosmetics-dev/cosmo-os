import { describe, expect, it } from "vitest";

import {
  buildBrandWarehouseViolations,
  buildCosmeticsStockReport,
  buildCosmeticsStockReportDetails,
  classifyWarehouseKind,
  computeCriticalCutoff,
  markCriticalTopSellers,
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

describe("classifyWarehouseKind", () => {
  it("classifies Cosmo main, shops, and other warehouses", () => {
    expect(classifyWarehouseKind("Main Warehouse - Cosmo")).toBe("main");
    expect(classifyWarehouseKind("Pepiliyana Shop Warehouse")).toBe("shop");
    expect(classifyWarehouseKind("Pepiliyana Main Warehouse")).toBe("online");
    expect(classifyWarehouseKind("Main Warehouse - SPK")).toBe("online");
    expect(classifyWarehouseKind("Website Inventory - Cosmo")).toBe("online");
    expect(classifyWarehouseKind("Stores - CCON")).toBe("online");
  });
});

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
        "Online Warehouse(s)": "Pepiliyana",
        "Online Qty": 3,
        "Shop Warehouse(s)": "Pepiliyana",
        "Shop Qty": 7,
        "Stock Available Elsewhere": "Yes",
      },
    ]);
  });

  it("lists other main warehouses in online and shop floors in shops", () => {
    const details = buildCosmeticsStockReportDetails([
      row({ Item: "SKU-1", "Balance Qty": 0 }),
      row({
        Item: "SKU-1",
        Warehouse: "Main Warehouse - SPK",
        "Balance Qty": 8,
      }),
      row({
        Item: "SKU-1",
        Company: "LMJ",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 3,
      }),
    ]);

    expect(details[0]?.online).toMatchObject([{ name: "SPK", qty: 8, kind: "online" }]);
    expect(details[0]?.shops).toMatchObject([{ name: "Pepiliyana", qty: 3, kind: "shop" }]);
  });

  it("lists website / non-shop stock with shops", () => {
    const details = buildCosmeticsStockReportDetails([
      row({ Item: "SKU-1", "Balance Qty": 0 }),
      row({
        Item: "SKU-1",
        Warehouse: "Website Inventory - Cosmo",
        "Balance Qty": 8,
      }),
      row({
        Item: "SKU-1",
        Company: "LMJ",
        Warehouse: "Pepiliyana Shop Warehouse",
        "Balance Qty": 3,
      }),
    ]);

    expect(details[0]?.online.map((loc) => loc.warehouse)).toEqual(["Website Inventory - Cosmo"]);
    expect(details[0]?.shops.map((loc) => loc.name)).toEqual(["Pepiliyana"]);
    expect(details[0]?.["Online Qty"]).toBe(8);
    expect(details[0]?.["Shop Qty"]).toBe(3);
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
        "Shop Warehouse(s)": "Cool Planet, Kiribathgoda, Maharagama, Pepiliyana",
        "Shop Qty": 9,
        "Stock Available Elsewhere": "Yes",
      },
    ]);
  });

  it("uses selected warehouse tokens for shop name over company display", () => {
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
        "Shop Warehouse(s)": "SPK",
        "Shop Qty": 7,
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

describe("computeCriticalCutoff / markCriticalTopSellers", () => {
  it("uses the 20th-percentile-from-top units and includes ties", () => {
    expect(computeCriticalCutoff([100, 80, 50, 20, 10])).toBe(100);
    expect(computeCriticalCutoff([100, 90, 80, 70, 60, 50, 40, 30, 20, 10])).toBe(90);
    expect(computeCriticalCutoff([10, 10, 1])).toBe(10);
    expect(computeCriticalCutoff([0, 0])).toBeNull();
  });

  it("marks top sellers Critical and never marks zero-sale SKUs", () => {
    const details = buildCosmeticsStockReportDetails([
      row({ Item: "FAST", "Balance Qty": 2 }),
      row({ Item: "SLOW", "Balance Qty": 2 }),
      row({ Item: "DEAD", "Balance Qty": 0 }),
    ], 3);

    const sales = new Map<string, number>([
      ["OTHER-1", 100],
      ["FAST", 80],
      ["OTHER-2", 70],
      ["OTHER-3", 60],
      ["OTHER-4", 50],
      ["OTHER-5", 40],
      ["OTHER-6", 30],
      ["OTHER-7", 20],
      ["OTHER-8", 15],
      ["SLOW", 2],
    ]);

    const { rows, cutoff } = markCriticalTopSellers(details, sales, true);
    expect(cutoff).toBe(80);
    expect(rows.find((r) => r.SKU === "FAST")?.critical).toBe(true);
    expect(rows.find((r) => r.SKU === "SLOW")?.critical).toBe(false);
    expect(rows.find((r) => r.SKU === "DEAD")?.critical).toBe(false);
    expect(rows[0]?.SKU).toBe("FAST");
  });

  it("clears Critical when sales ranking is unavailable", () => {
    const details = buildCosmeticsStockReportDetails([
      row({ Item: "FAST", "Balance Qty": 0 }),
    ]);
    const { rows, cutoff } = markCriticalTopSellers(details, new Map([["FAST", 99]]), false);
    expect(cutoff).toBeNull();
    expect(rows[0]?.critical).toBe(false);
    expect(rows[0]?.sales90d).toBe(0);
  });
});

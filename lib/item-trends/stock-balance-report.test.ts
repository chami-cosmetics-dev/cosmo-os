import { describe, expect, it } from "vitest";

import { parseStockBalanceReport } from "@/lib/item-trends/stock-balance-report";

describe("parseStockBalanceReport", () => {
  it("reads dict rows by column fieldname and drops All Warehouses roll-ups and total rows", () => {
    const columns = [
      { fieldname: "item_code", label: "Item" },
      { fieldname: "warehouse", label: "Warehouse" },
      { fieldname: "company", label: "Company" },
      { fieldname: "bal_qty", label: "Balance Qty" },
    ];
    const result = [
      { item_code: "SKU-1", warehouse: "Main Warehouse - Cosmo", company: "Cosmo", bal_qty: 10 },
      { item_code: "SKU-1", warehouse: "Shop Warehouse - Cosmo", company: "Cosmo", bal_qty: "5" },
      { item_code: "SKU-1", warehouse: "All Warehouses - Cosmo", company: "Cosmo", bal_qty: 15 },
      { item_code: "", warehouse: "", bal_qty: 15 },
    ];
    expect(parseStockBalanceReport(columns, result)).toEqual([
      { sku: "SKU-1", warehouse: "Main Warehouse - Cosmo", qty: 10 },
      { sku: "SKU-1", warehouse: "Shop Warehouse - Cosmo", qty: 5 },
    ]);
  });

  it("reads positional rows with old-style string columns", () => {
    const columns = ["Item:Link/Item:150", "Warehouse:Link/Warehouse:150", "Balance Qty:Float:100"];
    const result = [["SKU-2", "Main Warehouse - AJS", 1234.5]];
    expect(parseStockBalanceReport(columns, result)).toEqual([
      { sku: "SKU-2", warehouse: "Main Warehouse - AJS", qty: 1234.5 },
    ]);
  });

  it("throws when a required column is missing", () => {
    expect(() => parseStockBalanceReport([{ fieldname: "item_code", label: "Item" }], [])).toThrow(
      /missing an Item, Warehouse or Balance Qty column/,
    );
  });
});

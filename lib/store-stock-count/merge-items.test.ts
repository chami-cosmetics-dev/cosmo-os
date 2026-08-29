import { describe, expect, it } from "vitest";

import {
  fillMissingCompanyStock,
  markCompanyUnavailable,
  mergeCompanyItems,
  sumLiveStock,
} from "@/lib/store-stock-count/merge-items";
import type { StoreStockCountRow } from "@/lib/store-stock-count/types";

function apiItem(input: {
  sku: string;
  name: string;
  description: string;
  barcodes: string[];
  stock: number;
}) {
  return { ...input, stockByWarehouse: {} };
}

describe("mergeCompanyItems", () => {
  it("unions SKUs and sets company stock", () => {
    const a = mergeCompanyItems({
      existing: [],
      companyKey: "i1::Pevi",
      items: [
        apiItem({ sku: "abc", name: "A", description: "d", barcodes: ["1"], stock: 5 }),
        apiItem({ sku: "xyz", name: "X", description: "", barcodes: [], stock: 0 }),
      ],
    });
    expect(a).toHaveLength(2);
    expect(a.find((r) => r.skuKey === "ABC")?.stockByCompany["i1::Pevi"]).toBe(5);
    expect(a.find((r) => r.skuKey === "XYZ")?.stockByCompany["i1::Pevi"]).toBe(0);

    const b = mergeCompanyItems({
      existing: a,
      companyKey: "i1::SPK",
      items: [apiItem({ sku: "ABC", name: "A2", description: "d2", barcodes: ["2"], stock: 3 })],
    });
    const row = b.find((r) => r.skuKey === "ABC")!;
    expect(row.stockByCompany["i1::Pevi"]).toBe(5);
    expect(row.stockByCompany["i1::SPK"]).toBe(3);
    expect(row.barcodes).toEqual(["1", "2"]);
  });

  it("replaceCompanyStock clears prior then applies", () => {
    const existing: StoreStockCountRow[] = [
      {
        sku: "A",
        skuKey: "A",
        name: "A",
        description: "",
        barcodes: [],
        stockByCompany: { "i1::Pevi": 9 },
      },
    ];
    const next = mergeCompanyItems({
      existing,
      companyKey: "i1::Pevi",
      replaceCompanyStock: true,
      items: [apiItem({ sku: "A", name: "A", description: "", barcodes: [], stock: 2 })],
    });
    expect(next[0]!.stockByCompany["i1::Pevi"]).toBe(2);
  });
});

describe("markCompanyUnavailable / sumLiveStock / fillMissing", () => {
  it("marks null and sum rejects unavailable", () => {
    const rows: StoreStockCountRow[] = [
      {
        sku: "A",
        skuKey: "A",
        name: "A",
        description: "",
        barcodes: [],
        stockByCompany: { "i1::Pevi": 4, "i1::SPK": 1 },
      },
    ];
    const marked = markCompanyUnavailable(rows, "i1::SPK");
    expect(marked[0]!.stockByCompany["i1::SPK"]).toBeNull();
    expect(sumLiveStock(marked[0]!.stockByCompany, ["i1::Pevi", "i1::SPK"])).toBeNull();
    expect(sumLiveStock(rows[0]!.stockByCompany, ["i1::Pevi", "i1::SPK"])).toBe(5);
  });

  it("fills missing successful company keys with 0", () => {
    const rows: StoreStockCountRow[] = [
      {
        sku: "A",
        skuKey: "A",
        name: "A",
        description: "",
        barcodes: [],
        stockByCompany: { "i1::Pevi": 4 },
      },
    ];
    const filled = fillMissingCompanyStock(rows, ["i1::Pevi", "i1::SPK"], 0);
    expect(filled[0]!.stockByCompany["i1::SPK"]).toBe(0);
    expect(sumLiveStock(filled[0]!.stockByCompany, ["i1::Pevi", "i1::SPK"])).toBe(4);
  });
});

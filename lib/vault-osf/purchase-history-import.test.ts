import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  parseDilhanPurchaseHistorySheet,
  VAULT_OSF_PURCHASE_HISTORY_MONTHS,
} from "@/lib/vault-osf/purchase-history-import";
import {
  aggregateCosmoMonthlyPurchases,
  mergeCosmoPurchasesIntoOsf,
  mergeErpAndCosmoSupplierMaps,
  mergeLastPurchaseMaps,
  supplierPurchasesFromCosmoLines,
} from "@/lib/vault-osf/purchase-history-merge";
import type { PurchaseCell } from "@/lib/vault-osf/types";

function xlsxBuffer(aoa: (string | number | Date | null)[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "MAIN HISTORY WORKING");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("Dilhan purchase history parse", () => {
  it("parses Date / SKU U / Supplier / Qty / Rate rows", () => {
    const buf = xlsxBuffer([
      [null],
      ["Date", "SKU U", "Supplier", "Company", "Transaction Type", "PO No.", "Country", "Brand", "Priority", "Product/Service", "Qty", "Rate", "Amount"],
      [new Date(2026, 3, 15), "AA001-1", "N I Cosmetics", "Supplement", "Bill", "ACC-PINV-1", "AU", "Brand", "Top", "Item", 2, 1000, 2000],
      [new Date(2025, 0, 10), "AA001-1", "Old Supplier", "Origins", "Bill", "OLD-1", "AU", "Brand", "Top", "Item", 1, 800, 800],
      [null, null, null, null, null, null, null, null, null, null, null, null, null],
    ]);
    const parsed = parseDilhanPurchaseHistorySheet(buf, "h.xlsx");
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]).toMatchObject({
      sku: "AA001-1",
      supplier: "N I Cosmetics",
      postingDate: "2026-04-15",
      qty: 2,
      rate: 1000,
      netValue: 2000,
    });
    expect(parsed.lines[1]!.postingDate).toBe("2025-01-10");
  });
});

describe("purchase history OSF / calculator merge", () => {
  it("aggregates only April/May for OSF months", () => {
    expect([...VAULT_OSF_PURCHASE_HISTORY_MONTHS]).toEqual(["2026-04", "2026-05"]);
    const map = aggregateCosmoMonthlyPurchases([
      {
        sku: "AA001-1",
        supplier: "S1",
        postingDate: "2026-04-10",
        qty: 2,
        rate: 100,
        netValue: 200,
      },
      {
        sku: "AA001-1",
        supplier: "S1",
        postingDate: "2026-04-20",
        qty: 1,
        rate: 100,
        netValue: 100,
      },
      {
        sku: "AA001-1",
        supplier: "S1",
        postingDate: "2026-06-01",
        qty: 9,
        rate: 50,
        netValue: 450,
      },
      {
        sku: "AA001-1",
        supplier: "S1",
        postingDate: "2025-04-01",
        qty: 5,
        rate: 40,
        netValue: 200,
      },
    ]);
    expect(map.get("AA001-1")).toEqual({
      "2026-04": { qty: 3, netValue: 300 },
    });
  });

  it("gap-fills OSF purchases; ERP qty wins", () => {
    const purchases = new Map<string, Record<string, PurchaseCell>>([
      ["AA001-1", { "2026-04": { qty: 10, netValue: 999 } }],
    ]);
    mergeCosmoPurchasesIntoOsf(
      purchases,
      aggregateCosmoMonthlyPurchases([
        {
          sku: "AA001-1",
          supplier: "S1",
          postingDate: "2026-04-10",
          qty: 2,
          rate: 100,
          netValue: 200,
        },
        {
          sku: "BB002-1",
          supplier: "S1",
          postingDate: "2026-05-01",
          qty: 4,
          rate: 50,
          netValue: 200,
        },
      ]),
    );
    expect(purchases.get("AA001-1")!["2026-04"]).toEqual({ qty: 10, netValue: 999 });
    expect(purchases.get("BB002-1")!["2026-05"]).toEqual({ qty: 4, netValue: 200 });
  });

  it("merges older Cosmo rates into supplier best-ever", () => {
    const cosmo = supplierPurchasesFromCosmoLines(
      [
        {
          sku: "AA001-1",
          supplier: "N I Cosmetics",
          postingDate: "2024-05-01",
          qty: 2,
          rate: 900,
          netValue: 1800,
        },
      ],
      "AA001-1",
    );
    const key = [...cosmo.keys()][0]!;
    const erp = new Map([
      [
        key,
        {
          supplierKey: key,
          displayName: "N I Cosmetics",
          bestEverRate: 1200,
          bestEverDate: "2026-08-01",
          lastRate: 1200,
          lastDate: "2026-08-01",
          lastQty: 1,
        },
      ],
    ]);
    const merged = mergeErpAndCosmoSupplierMaps(erp, cosmo);
    expect(merged.get(key)!.bestEverRate).toBe(900);
    expect(merged.get(key)!.lastRate).toBe(1200);
  });

  it("newer Cosmo last-purchase wins over older ERP", () => {
    const erp = new Map([
      [
        "AA001-1",
        {
          supplier: "Old",
          qty: 1,
          rate: 500,
          date: "2026-01-01",
          recentQty: 0,
        },
      ],
    ]);
    const cosmo = new Map([
      [
        "AA001-1",
        {
          supplier: "New",
          qty: 2,
          rate: 600,
          date: "2026-09-01",
          recentQty: 2,
        },
      ],
    ]);
    const merged = mergeLastPurchaseMaps(erp, cosmo);
    expect(merged.get("AA001-1")).toMatchObject({
      supplier: "New",
      rate: 600,
      date: "2026-09-01",
      recentQty: 2,
    });
  });
});

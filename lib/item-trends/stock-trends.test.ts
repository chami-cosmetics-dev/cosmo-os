import { describe, expect, it, vi } from "vitest";

import {
  computeStockTrendMetrics,
  currentStockBySku,
  computeStockTrendSeries,
  fetchStockLedgerEntries,
  mapWithConcurrency,
  warehouseFilterForChannel,
  warehouseMatchesChannel,
  type StockLedgerEntry,
} from "@/lib/item-trends/stock-trends";

let seq = 0;

function entry(partial: Partial<StockLedgerEntry> & { postingDate: string }): StockLedgerEntry {
  seq += 1;
  return {
    itemCode: "SKU-1",
    warehouse: "Main Warehouse - Cosmo",
    postingAt: new Date(`${partial.postingDate}T00:00:00.${String(seq).padStart(3, "0")}`),
    creationAt: new Date(`${partial.postingDate}T00:00:00.${String(seq).padStart(3, "0")}`),
    inQty: 0,
    outQty: 0,
    balanceQty: 0,
    voucherType: "",
    voucherNo: "",
    ...partial,
  };
}

const RANGE = { fromYmd: "2026-01-01", toYmd: "2026-01-31" };

describe("computeStockTrendMetrics", () => {
  it("returns defaults for no history", () => {
    const result = computeStockTrendMetrics([], RANGE);
    expect(result).toEqual({
      createdDate: null,
      initialStock: 0,
      currentStock: 0,
      latestStockoutDate: null,
      unitsPurchased: 0,
      unitsSold: 0,
      wasRestocked: false,
    });
  });

  it("takes createdDate/initialStock from the earliest In Qty row and currentStock from the latest row", () => {
    const rows = [
      entry({ postingDate: "2025-12-01", inQty: 100, balanceQty: 100 }),
      entry({ postingDate: "2025-12-15", outQty: 40, balanceQty: 60, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2026-02-01", outQty: 10, balanceQty: 50, voucherType: "Sales Invoice" }),
    ];
    const result = computeStockTrendMetrics(rows, RANGE);
    expect(result.createdDate).toBe("2025-12-01");
    expect(result.initialStock).toBe(100);
    expect(result.currentStock).toBe(50);
  });

  it("falls back to the first row overall when there is no In Qty row", () => {
    const rows = [
      entry({ postingDate: "2025-12-01", outQty: 5, balanceQty: -5, voucherType: "Stock Reconciliation" }),
    ];
    const result = computeStockTrendMetrics(rows, RANGE);
    expect(result.createdDate).toBe("2025-12-01");
    expect(result.initialStock).toBe(-5);
  });

  it("sums unitsPurchased/unitsSold over the whole history regardless of range, and unitsSold only from Sales Invoice out rows", () => {
    const rows = [
      entry({ postingDate: "2025-12-01", inQty: 100, balanceQty: 100, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2026-01-05", inQty: 20, balanceQty: 120, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2026-01-10", outQty: 15, balanceQty: 105, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2026-01-12", outQty: 5, balanceQty: 100, voucherType: "Stock Transfer" }),
      entry({ postingDate: "2026-02-01", outQty: 30, balanceQty: 70, voucherType: "Sales Invoice" }),
    ];
    const result = computeStockTrendMetrics(rows, RANGE);
    expect(result.unitsPurchased).toBe(120);
    expect(result.unitsSold).toBe(45);
  });

  it("counts unitsPurchased only from Purchase Receipt/Purchase Invoice rows, excluding Stock Entry, Stock Reconciliation, and Sales Invoice returns", () => {
    const rows = [
      entry({ postingDate: "2026-01-02", inQty: 10, balanceQty: 10, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2026-01-05", inQty: 8, balanceQty: 18, voucherType: "Purchase Invoice" }),
      entry({ postingDate: "2026-01-08", inQty: 4, balanceQty: 22, voucherType: "Stock Entry" }),
      entry({ postingDate: "2026-01-10", inQty: 3, balanceQty: 25, voucherType: "Stock Reconciliation" }),
      entry({ postingDate: "2026-01-12", inQty: 2, balanceQty: 27, voucherType: "Sales Invoice" }),
    ];
    const result = computeStockTrendMetrics(rows, RANGE);
    expect(result.unitsPurchased).toBe(18); // 10 + 8 only
  });

  it("finds the most recent date Balance Qty hit exactly 0", () => {
    const rows = [
      entry({ postingDate: "2025-11-01", inQty: 10, balanceQty: 10 }),
      entry({ postingDate: "2025-11-05", outQty: 10, balanceQty: 0, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2025-11-06", inQty: 10, balanceQty: 10 }),
      entry({ postingDate: "2025-11-20", outQty: 10, balanceQty: 0, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2025-11-25", inQty: 5, balanceQty: 5 }),
    ];
    const result = computeStockTrendMetrics(rows, RANGE);
    expect(result.latestStockoutDate).toBe("2025-11-20");
  });

  it("returns null latestStockoutDate when balance never hit 0", () => {
    const rows = [entry({ postingDate: "2025-11-01", inQty: 10, balanceQty: 10 })];
    expect(computeStockTrendMetrics(rows, RANGE).latestStockoutDate).toBeNull();
  });

  it("flags wasRestocked when the first Purchase Receipt/Invoice In Qty after a Sales-Invoice-driven stockout falls in range", () => {
    const rows = [
      entry({ postingDate: "2025-12-01", inQty: 10, balanceQty: 10, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2025-12-20", outQty: 10, balanceQty: 0, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2026-01-10", inQty: 20, balanceQty: 20, voucherType: "Purchase Receipt" }),
    ];
    expect(computeStockTrendMetrics(rows, RANGE).wasRestocked).toBe(true);
  });

  it("does not flag wasRestocked for a Stock Entry/Stock Reconciliation In Qty row after a stockout — only Purchase Receipt/Invoice counts as the restock", () => {
    const rows = [
      entry({ postingDate: "2025-12-01", inQty: 10, balanceQty: 10, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2025-12-20", outQty: 10, balanceQty: 0, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2026-01-10", inQty: 20, balanceQty: 20, voucherType: "Stock Reconciliation" }),
    ];
    expect(computeStockTrendMetrics(rows, RANGE).wasRestocked).toBe(false);
  });

  it("still flags wasRestocked on the next Purchase Receipt row even after a non-qualifying In Qty row is ignored", () => {
    const rows = [
      entry({ postingDate: "2025-12-01", inQty: 10, balanceQty: 10, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2025-12-20", outQty: 10, balanceQty: 0, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2026-01-05", inQty: 4, balanceQty: 4, voucherType: "Stock Entry" }),
      entry({ postingDate: "2026-01-10", inQty: 20, balanceQty: 24, voucherType: "Purchase Invoice" }),
    ];
    expect(computeStockTrendMetrics(rows, RANGE).wasRestocked).toBe(true);
  });

  it("does not flag wasRestocked when the depleting Out Qty row is not a Sales Invoice", () => {
    const rows = [
      entry({ postingDate: "2025-12-01", inQty: 10, balanceQty: 10 }),
      entry({ postingDate: "2025-12-20", outQty: 10, balanceQty: 0, voucherType: "Stock Transfer" }),
      entry({ postingDate: "2026-01-10", inQty: 20, balanceQty: 20 }),
    ];
    expect(computeStockTrendMetrics(rows, RANGE).wasRestocked).toBe(false);
  });

  it("does not flag wasRestocked when the qualifying In Qty row falls outside range", () => {
    const rows = [
      entry({ postingDate: "2025-11-01", inQty: 10, balanceQty: 10, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2025-11-20", outQty: 10, balanceQty: 0, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2025-11-25", inQty: 20, balanceQty: 20, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2026-01-15", inQty: 5, balanceQty: 25, voucherType: "Purchase Receipt" }),
    ];
    expect(computeStockTrendMetrics(rows, RANGE).wasRestocked).toBe(false);
  });

  it("does not flag wasRestocked for a plain restock with no prior stockout", () => {
    const rows = [
      entry({ postingDate: "2025-12-01", inQty: 10, balanceQty: 10, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2025-12-20", outQty: 5, balanceQty: 5, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2026-01-10", inQty: 20, balanceQty: 25, voucherType: "Purchase Receipt" }),
    ];
    expect(computeStockTrendMetrics(rows, RANGE).wasRestocked).toBe(false);
  });

  it("only flags the first In Qty row of each stockout cycle, and requires a fresh drop to retrigger", () => {
    const rows = [
      entry({ postingDate: "2025-12-01", inQty: 10, balanceQty: 10, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2025-12-20", outQty: 10, balanceQty: 0, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2026-01-05", inQty: 20, balanceQty: 20, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2026-01-10", inQty: 5, balanceQty: 25, voucherType: "Purchase Receipt" }),
    ];
    expect(computeStockTrendMetrics(rows, RANGE).wasRestocked).toBe(true);
  });

  describe("multi-warehouse aggregation", () => {
    it("sums each warehouse's own latest balance into initialStock/currentStock, not just one warehouse's row", () => {
      const rows = [
        entry({ postingDate: "2025-12-01", warehouse: "Main Warehouse - Cosmo", inQty: 10, balanceQty: 10 }),
        entry({ postingDate: "2025-12-02", warehouse: "Shop Warehouse - Cosmo", inQty: 5, balanceQty: 5 }),
      ];
      const result = computeStockTrendMetrics(rows, RANGE);
      expect(result.createdDate).toBe("2025-12-01");
      expect(result.initialStock).toBe(10); // only Main had stock yet
      expect(result.currentStock).toBe(15); // Main's 10 + Shop's 5
    });

    it("bases latestStockoutDate and wasRestocked on the cross-warehouse total, not any single warehouse hitting 0", () => {
      const rows = [
        entry({ postingDate: "2025-12-01", warehouse: "Main Warehouse - Cosmo", inQty: 10, balanceQty: 10 }),
        entry({ postingDate: "2025-12-02", warehouse: "Shop Warehouse - Cosmo", inQty: 5, balanceQty: 5 }),
        // Main alone hits 0, but Shop still has 5 — total is 5, not a stockout.
        entry({
          postingDate: "2025-12-10",
          warehouse: "Main Warehouse - Cosmo",
          outQty: 10,
          balanceQty: 0,
          voucherType: "Sales Invoice",
        }),
        // Restocking Main here should NOT count — total never dropped to 0.
        entry({ postingDate: "2025-12-12", warehouse: "Main Warehouse - Cosmo", inQty: 3, balanceQty: 3 }),
        // Shop alone hits 0, but Main still has 3 — still not a stockout.
        entry({
          postingDate: "2025-12-15",
          warehouse: "Shop Warehouse - Cosmo",
          outQty: 5,
          balanceQty: 0,
          voucherType: "Sales Invoice",
        }),
        // Now Main also hits 0 — total is 0. This is the real stockout.
        entry({
          postingDate: "2025-12-20",
          warehouse: "Main Warehouse - Cosmo",
          outQty: 3,
          balanceQty: 0,
          voucherType: "Sales Invoice",
        }),
        entry({
          postingDate: "2026-01-05",
          warehouse: "Shop Warehouse - Cosmo",
          inQty: 7,
          balanceQty: 7,
          voucherType: "Purchase Receipt",
        }),
      ];
      const result = computeStockTrendMetrics(rows, RANGE);
      expect(result.latestStockoutDate).toBe("2025-12-20");
      expect(result.wasRestocked).toBe(true);
      expect(result.currentStock).toBe(7); // Main's 0 + Shop's 7
    });
  });
});

describe("computeStockTrendSeries", () => {
  it("returns an empty series for no history", () => {
    expect(computeStockTrendSeries([])).toEqual([]);
  });

  it("returns one chronologically ordered point per ledger row with the running cross-warehouse total", () => {
    const rows = [
      entry({ postingDate: "2026-01-10", inQty: 20, balanceQty: 20, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2026-01-01", inQty: 10, balanceQty: 10, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2026-01-05", outQty: 4, balanceQty: 6, voucherType: "Sales Invoice" }),
    ];
    const series = computeStockTrendSeries(rows);
    expect(series.map((p) => p.date)).toEqual(["2026-01-01", "2026-01-05", "2026-01-10"]);
    expect(series.map((p) => p.totalBalance)).toEqual([10, 6, 20]);
  });

  it("flags isStockout exactly where the cross-warehouse total hits 0", () => {
    const rows = [
      entry({ postingDate: "2026-01-01", inQty: 10, balanceQty: 10, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2026-01-05", outQty: 10, balanceQty: 0, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2026-01-10", inQty: 5, balanceQty: 5, voucherType: "Purchase Receipt" }),
    ];
    const series = computeStockTrendSeries(rows);
    expect(series.map((p) => p.isStockout)).toEqual([false, true, false]);
  });

  it("flags isPurchaseRestock only on the first Purchase Receipt/Invoice row after a Sales-Invoice-driven stockout", () => {
    const rows = [
      entry({ postingDate: "2026-01-01", inQty: 10, balanceQty: 10, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2026-01-05", outQty: 10, balanceQty: 0, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2026-01-08", inQty: 4, balanceQty: 4, voucherType: "Stock Entry" }),
      entry({ postingDate: "2026-01-10", inQty: 20, balanceQty: 24, voucherType: "Purchase Invoice" }),
      entry({ postingDate: "2026-01-15", inQty: 3, balanceQty: 27, voucherType: "Purchase Receipt" }),
    ];
    const series = computeStockTrendSeries(rows);
    expect(series.map((p) => p.isPurchaseRestock)).toEqual([false, false, false, true, false]);
  });

  it("agrees with computeStockTrendMetrics on createdDate/currentStock/latestStockoutDate for the same entries", () => {
    const rows = [
      entry({ postingDate: "2025-12-01", warehouse: "Main Warehouse - Cosmo", inQty: 10, balanceQty: 10, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2025-12-20", warehouse: "Main Warehouse - Cosmo", outQty: 10, balanceQty: 0, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2026-01-05", warehouse: "Shop Warehouse - Cosmo", inQty: 7, balanceQty: 7, voucherType: "Purchase Receipt" }),
    ];
    const metrics = computeStockTrendMetrics(rows, RANGE);
    const series = computeStockTrendSeries(rows);

    expect(metrics.createdDate).toBe(series[0]?.date);
    expect(metrics.currentStock).toBe(series[series.length - 1]?.totalBalance);
    const lastStockout = [...series].reverse().find((p) => p.isStockout);
    expect(metrics.latestStockoutDate).toBe(lastStockout?.date ?? null);
    expect(metrics.wasRestocked).toBe(series.some((p) => p.isPurchaseRestock && p.date >= RANGE.fromYmd && p.date <= RANGE.toYmd));
  });
});

describe("mapWithConcurrency", () => {
  it("preserves result order regardless of completion order", async () => {
    const delays = [30, 10, 20, 0];
    const results = await mapWithConcurrency(delays, 4, (ms, i) => new Promise((resolve) => {
      setTimeout(() => resolve(i), ms);
    }));
    expect(results).toEqual([0, 1, 2, 3]);
  });

  it("never runs more than `limit` tasks concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await mapWithConcurrency(items, 3, async (i) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return i;
    });

    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("returns an empty array for empty input", async () => {
    const results = await mapWithConcurrency([], 4, async (x) => x);
    expect(results).toEqual([]);
  });

  it("runs every item exactly once", async () => {
    const seen: number[] = [];
    const items = [1, 2, 3, 4, 5];
    await mapWithConcurrency(items, 2, async (i) => {
      seen.push(i);
      return i;
    });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });
});

describe("warehouseFilterForChannel", () => {
  it("fetches every warehouse for online (two name patterns; narrowed in memory)", () => {
    expect(warehouseFilterForChannel("online")).toBeNull();
  });

  it("returns a like filter matching 'Shop Warehouse' for shop", () => {
    expect(warehouseFilterForChannel("shop")).toEqual(["warehouse", "like", "%Shop Warehouse%"]);
  });

  it("returns null for 'all' or when omitted — no warehouse filter at all", () => {
    expect(warehouseFilterForChannel("all")).toBeNull();
    expect(warehouseFilterForChannel(null)).toBeNull();
    expect(warehouseFilterForChannel(undefined)).toBeNull();
  });
});

describe("currentStockBySku", () => {
  const rows = [
    { sku: "SKU-1", warehouse: "Main Warehouse - Cosmo", qty: 10 },
    { sku: "SKU-1", warehouse: "Kiribathgoda Shop Warehouse - Cosmo", qty: 4 },
    { sku: "SKU-1", warehouse: "Main Warehouse - AJS", qty: 3 },
    { sku: "SKU-2", warehouse: "Shop Warehouse - AJS", qty: 7 },
  ];

  it("sums every warehouse for the all channel", () => {
    const map = currentStockBySku(rows, "all");
    expect(map.get("SKU-1")).toBe(17);
    expect(map.get("SKU-2")).toBe(7);
  });

  it("counts Cosmo shop warehouses as online; only other companies' Shop Warehouses are shop", () => {
    expect(currentStockBySku(rows, "online").get("SKU-1")).toBe(17);
    expect(currentStockBySku(rows, "online").has("SKU-2")).toBe(false);
    expect(currentStockBySku(rows, "shop").has("SKU-1")).toBe(false);
    expect(currentStockBySku(rows, "shop").get("SKU-2")).toBe(7);
  });
});

describe("warehouseMatchesChannel — business warehouse list", () => {
  const online = [
    "Cool Planet Nugegoda Shop Warehouse - Cosmo",
    "GCC Shop Warehouse - Cosmo",
    "Kiribathgoda Shop Warehouse - Cosmo",
    "Maharagama Shop Warehouse - Cosmo",
    "Main Warehouse - Cosmo",
    "Negombo Shop Warehouse - Cosmo",
    "OGF Shop Warehouse - Cosmo",
    "Pepiliyana Shop Warehouse - Cosmo",
    "Main Warehouse - AJS",
    "Main Warehouse - Chami",
    "Main Warehouse - DRO",
    "Main Warehouse - DTD",
    "Main Warehouse - KAD",
    "Main Warehouse - LMJ",
    "Main Warehouse - LWK",
    "Main Warehouse - MNK",
    "Main Warehouse - SPK",
    "Main Warehouse - Udara",
    "Main Warehouse - USP",
    "Main Warehouses - Pevi",
  ];
  const shop = [
    "Shop Warehouse - AJS",
    "Shop Warehouse - Chami",
    "Shop Warehouse - DRO",
    "Shop Warehouse - DTD",
    "Shop Warehouse - LMJ",
    "Shop Warehouse - LWK",
    "Shop Warehouse - MNK",
  ];

  it.each(online)("%s → online", (w) => {
    expect(warehouseMatchesChannel(w, "online")).toBe(true);
    expect(warehouseMatchesChannel(w, "shop")).toBe(false);
  });

  it.each(shop)("%s → shop", (w) => {
    expect(warehouseMatchesChannel(w, "shop")).toBe(true);
    expect(warehouseMatchesChannel(w, "online")).toBe(false);
  });

  it("puts every warehouse under all", () => {
    for (const w of [...online, ...shop]) expect(warehouseMatchesChannel(w, "all")).toBe(true);
  });
});

describe("unitsPurchased", () => {
  it("counts In Qty only — Out Qty on purchase vouchers isn't subtracted", () => {
    const rows = [
      entry({ postingDate: "2026-01-02", inQty: 12, balanceQty: 12, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2026-01-03", outQty: 9, balanceQty: 3, voucherType: "Purchase Receipt" }),
    ];
    const result = computeStockTrendMetrics(rows, RANGE);
    expect(result.unitsPurchased).toBe(12);
    expect(result.unitsSold).toBe(0);
  });
});

describe("fetchStockLedgerEntries", () => {
  it("drops rows from cancelled vouchers (v13+ 0/1 and v12 Yes/No)", async () => {
    const row = (voucher_no: string, actual_qty: number, is_cancelled: number | string) => ({
      item_code: "SKU-1",
      warehouse: "Main Warehouse - Cosmo",
      posting_date: "2026-01-02",
      posting_time: "10:00:00",
      actual_qty,
      qty_after_transaction: actual_qty,
      voucher_type: "Purchase Receipt",
      voucher_no,
      creation: "2026-01-02 10:00:00",
      is_cancelled,
    });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [row("PR-1", 12, 1), row("PR-1", -12, 1), row("PR-2", 5, "Yes"), row("PR-1-1", 12, 0), row("PR-3", 2, "No")],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const rows = await fetchStockLedgerEntries({ baseUrl: "https://erp.test", apiKey: "k", apiSecret: "s" }, ["SKU-1"]);
      expect(rows.map((r) => r.voucherNo)).toEqual(["PR-1-1", "PR-3"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("computeStockTrendSeries initialStock", () => {
  it("marks only the first stock-in row with its post-receipt balance, even if a sale follows the same day", () => {
    const rows = [
      entry({ postingDate: "2026-10-08", inQty: 25, balanceQty: 25, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2026-10-08", outQty: 1, balanceQty: 24, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2026-10-12", inQty: 5, balanceQty: 29, voucherType: "Purchase Receipt" }),
    ];
    const series = computeStockTrendSeries(rows);
    expect(series.map((p) => p.initialStock)).toEqual([25, undefined, undefined]);
  });
});

describe("initial stock across both ERPs", () => {
  it("adds every stock-in on the first day (ERP 1 + ERP 2 warehouses), ignoring same-day sales", () => {
    const rows = [
      entry({ postingDate: "2026-10-12", warehouse: "Main Warehouse - Cosmo", inQty: 2, balanceQty: 2, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2026-10-12", warehouse: "Main Warehouse - AJS", inQty: 1, balanceQty: 1, voucherType: "Purchase Receipt" }),
      entry({ postingDate: "2026-10-12", warehouse: "Main Warehouse - AJS", outQty: 1, balanceQty: 0, voucherType: "Sales Invoice" }),
      entry({ postingDate: "2026-10-13", warehouse: "Main Warehouse - Cosmo", inQty: 4, balanceQty: 6, voucherType: "Purchase Receipt" }),
    ];
    expect(computeStockTrendSeries(rows)[0].initialStock).toBe(3);
    expect(computeStockTrendMetrics(rows, RANGE).initialStock).toBe(3);
  });
});

describe("computeStockTrendSeries erpBalances", () => {
  it("tracks each ERP's own total alongside the combined total", () => {
    const rows = [
      entry({ postingDate: "2026-10-12", warehouse: "Main Warehouse - Cosmo", inQty: 2, balanceQty: 2, voucherType: "Purchase Receipt", erp: "ERP 1" }),
      entry({ postingDate: "2026-10-12", warehouse: "Main Warehouse - AJS", inQty: 1, balanceQty: 1, voucherType: "Purchase Receipt", erp: "ERP 2" }),
      entry({ postingDate: "2026-10-13", warehouse: "Main Warehouse - Cosmo", outQty: 1, balanceQty: 1, voucherType: "Sales Invoice", erp: "ERP 1" }),
    ];
    const series = computeStockTrendSeries(rows);
    expect(series.map((p) => [p.totalBalance, p.erpBalances])).toEqual([
      [2, { "ERP 1": 2 }],
      [3, { "ERP 1": 2, "ERP 2": 1 }],
      [2, { "ERP 1": 1, "ERP 2": 1 }],
    ]);
  });

  it("leaves erpBalances off when rows aren't tagged with an ERP", () => {
    const series = computeStockTrendSeries([entry({ postingDate: "2026-10-12", inQty: 2, balanceQty: 2 })]);
    expect(series[0].erpBalances).toBeUndefined();
  });
});

describe("computeStockTrendSeries erpInitialStock", () => {
  it("marks each ERP's own first stock-in day, summing that ERP's same-day stock-ins", () => {
    const rows = [
      entry({ postingDate: "2026-10-08", warehouse: "Main Warehouse - Cosmo", inQty: 25, balanceQty: 25, voucherType: "Purchase Receipt", erp: "ERP 1" }),
      entry({ postingDate: "2026-10-08", warehouse: "Main Warehouse - Cosmo", outQty: 1, balanceQty: 24, voucherType: "Sales Invoice", erp: "ERP 1" }),
      entry({ postingDate: "2026-10-12", warehouse: "Main Warehouse - AJS", inQty: 2, balanceQty: 2, voucherType: "Purchase Receipt", erp: "ERP 2" }),
      entry({ postingDate: "2026-10-12", warehouse: "Shop Warehouse - AJS", inQty: 1, balanceQty: 1, voucherType: "Purchase Receipt", erp: "ERP 2" }),
      entry({ postingDate: "2026-10-13", warehouse: "Main Warehouse - Cosmo", inQty: 5, balanceQty: 29, voucherType: "Purchase Receipt", erp: "ERP 1" }),
    ];
    const series = computeStockTrendSeries(rows);
    expect(series.map((p) => p.erpInitialStock)).toEqual([{ "ERP 1": 25 }, undefined, { "ERP 2": 3 }, undefined, undefined]);
  });
});

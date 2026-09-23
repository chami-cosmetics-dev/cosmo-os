import { describe, expect, it } from "vitest";

import {
  accumulateLastPurchasesFromRows,
  accumulateMonthlyPurchasesFromRows,
  accumulateSupplierPurchasesFromRows,
  buildSupplierAllowlist,
  isAllowedSupplier,
  isNoisePurchaseSupplier,
  isUsablePurchaseDoc,
  mergeMonthlyPurchaseMaps,
  normalizeSupplierKey,
  type PurchaseRow,
} from "@/lib/osf/erp-purchases";

describe("normalizeSupplierKey / buildSupplierAllowlist / isAllowedSupplier", () => {
  it("normalizes trim + lowercase", () => {
    expect(normalizeSupplierKey("  Acme Co  ")).toBe("acme co");
    expect(normalizeSupplierKey(null)).toBe("");
  });

  it("builds set from name and code", () => {
    const set = buildSupplierAllowlist([
      { name: "Acme Distributors", code: "ACME" },
      { name: "", code: "  " },
    ]);
    expect(set.has("acme distributors")).toBe(true);
    expect(set.has("acme")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("empty allowlist fails open", () => {
    expect(isAllowedSupplier({ supplier: "ANY", supplier_name: "Anyone" }, new Set())).toBe(true);
  });

  it("matches ERP supplier id or name against Cosmo code or name (case-insensitive)", () => {
    const set = buildSupplierAllowlist([{ name: "Acme Distributors", code: "ACME" }]);
    expect(isAllowedSupplier({ supplier: "acme", supplier_name: "Other" }, set)).toBe(true);
    expect(
      isAllowedSupplier({ supplier: "SUP-99", supplier_name: "Acme Distributors" }, set),
    ).toBe(true);
    expect(
      isAllowedSupplier({ supplier: "INTERCO", supplier_name: "Vault Trading Co" }, set),
    ).toBe(false);
  });
});

describe("accumulateLastPurchasesFromRows", () => {
  const items = new Set(["CAN07"]);

  it("intercompany-only history leaves SKU blank", () => {
    const rows: PurchaseRow[] = [
      {
        name: "PR-1",
        supplier: "INTERCO",
        supplier_name: "Vault Transfer",
        posting_date: "2026-07-15",
        item_code: "CAN07",
        qty: 100,
        rate: 10,
      },
    ];
    const { result } = accumulateLastPurchasesFromRows({
      rows,
      itemCodes: items,
      recentSinceDate: "2026-06-20",
      allowedSuppliers: [{ name: "Acme", code: "ACME" }],
    });
    expect(result.has("CAN07")).toBe(false);
  });

  it("walks back past intercompany to older allowed receipt", () => {
    const rows: PurchaseRow[] = [
      {
        name: "PR-NEW",
        supplier: "INTERCO",
        supplier_name: "Vault Transfer",
        posting_date: "2026-07-15",
        item_code: "CAN07",
        qty: 100,
        rate: 1,
      },
      {
        name: "PR-OLD",
        supplier: "ACME",
        supplier_name: "Acme Distributors",
        posting_date: "2026-07-01",
        item_code: "CAN07",
        qty: 12,
        rate: 40,
      },
    ];
    const { result } = accumulateLastPurchasesFromRows({
      rows,
      itemCodes: items,
      recentSinceDate: "2026-06-20",
      allowedSuppliers: [{ name: "Acme Distributors", code: "ACME" }],
    });
    const p = result.get("CAN07")!;
    expect(p.supplier).toBe("Acme Distributors");
    expect(p.qty).toBe(12);
    expect(p.date).toBe("2026-07-01");
    expect(p.rate).toBe(40);
    expect(p.recentQty).toBe(12);
  });

  it("recent window ignores intercompany qty", () => {
    const rows: PurchaseRow[] = [
      {
        name: "PR-XFER",
        supplier: "INTERCO",
        supplier_name: "Vault Transfer",
        posting_date: "2026-07-10",
        item_code: "CAN07",
        qty: 50,
        rate: 1,
      },
      {
        name: "PR-BUY",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-07-05",
        item_code: "CAN07",
        qty: 8,
        rate: 20,
      },
      {
        name: "PR-BUY2",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-07-02",
        item_code: "CAN07",
        qty: 3,
        rate: 20,
      },
    ];
    const { result } = accumulateLastPurchasesFromRows({
      rows,
      itemCodes: items,
      recentSinceDate: "2026-06-20",
      allowedSuppliers: [{ name: "Acme", code: "ACME" }],
    });
    const p = result.get("CAN07")!;
    expect(p.qty).toBe(8);
    expect(p.date).toBe("2026-07-05");
    // 8 + 3 from allowed only; intercompany 50 excluded
    expect(p.recentQty).toBe(11);
  });

  it("empty allowlist keeps unfiltered legacy behavior", () => {
    const rows: PurchaseRow[] = [
      {
        name: "PR-1",
        supplier: "INTERCO",
        supplier_name: "Vault Transfer",
        posting_date: "2026-07-15",
        item_code: "CAN07",
        qty: 100,
        rate: 5,
      },
    ];
    const { result } = accumulateLastPurchasesFromRows({
      rows,
      itemCodes: items,
      recentSinceDate: "2026-06-20",
      allowedSuppliers: [],
    });
    const p = result.get("CAN07")!;
    expect(p.supplier).toBe("Vault Transfer");
    expect(p.qty).toBe(100);
    expect(p.recentQty).toBe(100);
  });

  it("sums multiple lines of the same allowed receipt", () => {
    const rows: PurchaseRow[] = [
      {
        name: "PR-1",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-07-15",
        item_code: "CAN07",
        qty: 5,
        rate: 10,
      },
      {
        name: "PR-1",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-07-15",
        item_code: "CAN07",
        qty: 7,
        rate: 10,
      },
    ];
    const { result } = accumulateLastPurchasesFromRows({
      rows,
      itemCodes: items,
      allowedSuppliers: [{ name: "Acme", code: "ACME" }],
    });
    expect(result.get("CAN07")!.qty).toBe(12);
  });

  it("skips draft/cancelled even when docstatus=1", () => {
    const rows: PurchaseRow[] = [
      {
        name: "PR-BAD",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-08-05",
        item_code: "CAN07",
        qty: 1,
        rate: 100,
        docstatus: 1,
        status: "Draft",
      },
      {
        name: "PR-CANCEL",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-08-04",
        item_code: "CAN07",
        qty: 1,
        rate: 50,
        docstatus: 2,
        status: "Cancelled",
      },
      {
        name: "PR-OK",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-07-01",
        item_code: "CAN07",
        qty: 8,
        rate: 4650,
        docstatus: 1,
        status: "Completed",
      },
    ];
    const { result } = accumulateLastPurchasesFromRows({
      rows,
      itemCodes: items,
      allowedSuppliers: [{ name: "Acme", code: "ACME" }],
    });
    expect(result.get("CAN07")!.rate).toBe(4650);
    expect(result.get("CAN07")!.date).toBe("2026-07-01");
  });

  it("walks past zero-rate lines to next priced purchase", () => {
    const rows: PurchaseRow[] = [
      {
        name: "PI-FREE",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-08-01",
        item_code: "CAN07",
        qty: 25,
        rate: 0,
        docstatus: 1,
        status: "Paid",
      },
      {
        name: "PI-OK",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-07-01",
        item_code: "CAN07",
        qty: 8,
        rate: 4650,
        docstatus: 1,
        status: "Paid",
      },
    ];
    const { result } = accumulateLastPurchasesFromRows({
      rows,
      itemCodes: items,
      allowedSuppliers: [],
    });
    expect(result.get("CAN07")!.rate).toBe(4650);
    expect(result.get("CAN07")!.date).toBe("2026-07-01");
  });
});

describe("isUsablePurchaseDoc", () => {
  it("rejects cancelled, draft, and return status", () => {
    expect(isUsablePurchaseDoc({ docstatus: 1, status: "Draft" })).toBe(false);
    expect(isUsablePurchaseDoc({ docstatus: 2, status: "Cancelled" })).toBe(false);
    expect(isUsablePurchaseDoc({ docstatus: 1, status: "Return", is_return: 1 })).toBe(
      false,
    );
    expect(isUsablePurchaseDoc({ docstatus: 1, status: "Completed" })).toBe(true);
    expect(isUsablePurchaseDoc({ docstatus: 1, status: "Paid" })).toBe(true);
  });
});

describe("isNoisePurchaseSupplier", () => {
  it("flags sync-test suppliers", () => {
    expect(
      isNoisePurchaseSupplier({
        supplier: "SYNC-TEST Supplier",
        supplier_name: "SYNC-TEST Supplier",
      }),
    ).toBe(true);
    expect(
      isNoisePurchaseSupplier({ supplier: "SV005", supplier_name: "Sachintha" }),
    ).toBe(false);
  });
});

describe("accumulateSupplierPurchasesFromRows", () => {
  it("groups two suppliers with best-ever and last purchase", () => {
    const rows: PurchaseRow[] = [
      {
        name: "PR-A2",
        supplier: "ACME",
        supplier_name: "Acme Distributors",
        posting_date: "2026-07-06",
        item_code: "CAN07",
        qty: 12,
        rate: 90,
      },
      {
        name: "PR-B1",
        supplier: "BETA",
        supplier_name: "Beta Trading",
        posting_date: "2026-03-15",
        item_code: "CAN07",
        qty: 6,
        rate: 80,
      },
      {
        name: "PR-A1",
        supplier: "ACME",
        supplier_name: "Acme Distributors",
        posting_date: "2025-11-12",
        item_code: "CAN07",
        qty: 4,
        rate: 75,
      },
    ];
    const result = accumulateSupplierPurchasesFromRows({
      rows,
      sku: "CAN07",
      allowedSuppliers: [
        { name: "Acme Distributors", code: "ACME" },
        { name: "Beta Trading", code: "BETA" },
      ],
    });
    expect(result.size).toBe(2);
    const acme = result.get("acme distributors")!;
    expect(acme.lastRate).toBe(90);
    expect(acme.lastDate).toBe("2026-07-06");
    expect(acme.bestEverRate).toBe(75);
    expect(acme.bestEverDate).toBe("2025-11-12");
    const beta = result.get("beta trading")!;
    expect(beta.bestEverRate).toBe(80);
    expect(beta.lastRate).toBe(80);
  });

  it("skips disallowed suppliers", () => {
    const rows: PurchaseRow[] = [
      {
        name: "PR-X",
        supplier: "INTERCO",
        supplier_name: "Vault Transfer",
        posting_date: "2026-07-15",
        item_code: "CAN07",
        qty: 100,
        rate: 10,
      },
      {
        name: "PR-A",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-07-01",
        item_code: "CAN07",
        qty: 5,
        rate: 40,
      },
    ];
    const result = accumulateSupplierPurchasesFromRows({
      rows,
      sku: "CAN07",
      allowedSuppliers: [{ name: "Acme", code: "ACME" }],
    });
    expect(result.size).toBe(1);
    expect(result.has("acme")).toBe(true);
  });

  it("lists unpriced supplier after priced ones stay null rates", () => {
    const rows: PurchaseRow[] = [
      {
        name: "PR-1",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-07-01",
        item_code: "CAN07",
        qty: 5,
        rate: null,
      },
    ];
    const result = accumulateSupplierPurchasesFromRows({
      rows,
      sku: "CAN07",
      allowedSuppliers: [],
    });
    const acme = result.get("acme")!;
    expect(acme.bestEverRate).toBeNull();
    expect(acme.lastRate).toBeNull();
    expect(acme.lastDate).toBe("2026-07-01");
  });

  it("skips draft status rows for supplier compare", () => {
    const rows: PurchaseRow[] = [
      {
        name: "PR-DRAFT",
        supplier: "SACH",
        supplier_name: "Sachintha",
        posting_date: "2026-08-05",
        item_code: "BV001-1",
        qty: 1,
        rate: 100,
        docstatus: 1,
        status: "Draft",
      },
      {
        name: "PI-OK",
        supplier: "SACH",
        supplier_name: "Sachintha",
        posting_date: "2026-06-01",
        item_code: "BV001-1",
        qty: 10,
        rate: 4650,
        docstatus: 1,
        status: "Paid",
      },
    ];
    const result = accumulateSupplierPurchasesFromRows({
      rows,
      sku: "BV001-1",
      allowedSuppliers: [],
    });
    const s = result.get("sachintha")!;
    expect(s.lastRate).toBe(4650);
    expect(s.bestEverRate).toBe(4650);
  });

  it("lists every real supplier and ranks by best-ever (Cash AE + Sachintha)", () => {
    const rows: PurchaseRow[] = [
      {
        name: "PI-CASH",
        supplier: "SV030",
        supplier_name: "Cash AE 001",
        posting_date: "2026-09-11",
        item_code: "BV001-1",
        qty: 5,
        rate: 5990,
        docstatus: 1,
        status: "Overdue",
        is_return: 0,
      },
      {
        name: "PI-RET",
        supplier: "SV029",
        supplier_name: "Cash OR 001",
        posting_date: "2026-08-24",
        item_code: "BV001-1",
        qty: -7,
        rate: 5103,
        docstatus: 1,
        status: "Return",
        is_return: 1,
      },
      {
        name: "PI-SACH",
        supplier: "SV005",
        supplier_name: "Sachintha",
        posting_date: "2026-08-05",
        item_code: "BV001-1",
        qty: 20,
        rate: 4650,
        docstatus: 1,
        status: "Paid",
        is_return: 0,
      },
      {
        name: "PI-SYNC",
        supplier: "SYNC-TEST Supplier",
        supplier_name: "SYNC-TEST Supplier",
        posting_date: "2026-08-03",
        item_code: "BV001-1",
        qty: 1,
        rate: 1,
        docstatus: 1,
        status: "Paid",
      },
    ];
    const result = accumulateSupplierPurchasesFromRows({
      rows,
      sku: "BV001-1",
      allowedSuppliers: [],
    });
    expect(result.size).toBe(2);
    expect(result.get("sachintha")!.bestEverRate).toBe(4650);
    expect(result.get("cash ae 001")!.lastRate).toBe(5990);
    expect(result.has("cash or 001")).toBe(false);
    expect(result.has("sync-test supplier")).toBe(false);
  });
});

describe("accumulateMonthlyPurchasesFromRows", () => {
  const bounds = { start: "2026-04-01", end: "2026-06-18" };

  it("buckets qty and amount by SKU-month and skips outside window", () => {
    const rows: PurchaseRow[] = [
      {
        name: "PR-1",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-04-10",
        item_code: "CAN07",
        qty: 2,
        rate: 50,
        amount: 100,
        docstatus: 1,
      },
      {
        name: "PR-2",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-04-20",
        item_code: "CAN07",
        qty: 3,
        rate: 50,
        amount: 150,
        docstatus: 1,
      },
      {
        name: "PR-3",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-03-31",
        item_code: "CAN07",
        qty: 9,
        amount: 900,
        docstatus: 1,
      },
    ];
    const map = accumulateMonthlyPurchasesFromRows({ rows, bounds });
    expect(map.get("CAN07")).toEqual({ "2026-04": { qty: 5, netValue: 250 } });
  });

  it("skips disallowed suppliers and cancelled docs", () => {
    const rows: PurchaseRow[] = [
      {
        name: "PR-X",
        supplier: "INTERCO",
        supplier_name: "Vault Transfer",
        posting_date: "2026-05-01",
        item_code: "CAN07",
        qty: 10,
        amount: 10,
        docstatus: 1,
      },
      {
        name: "PR-Y",
        supplier: "ACME",
        supplier_name: "Acme",
        posting_date: "2026-05-02",
        item_code: "CAN07",
        qty: 1,
        amount: 40,
        docstatus: 2,
      },
    ];
    const map = accumulateMonthlyPurchasesFromRows({
      rows,
      bounds,
      allowedSuppliers: [{ name: "Acme", code: "ACME" }],
    });
    expect(map.has("CAN07")).toBe(false);
  });

  it("merges monthly maps across ERP instances", () => {
    const a = new Map([["CAN07", { "2026-04": { qty: 1, netValue: 10 } }]]);
    const b = new Map([["CAN07", { "2026-04": { qty: 2, netValue: 20 }, "2026-05": { qty: 1, netValue: 5 } }]]);
    const merged = mergeMonthlyPurchaseMaps([a, b]);
    expect(merged.get("CAN07")).toEqual({
      "2026-04": { qty: 3, netValue: 30 },
      "2026-05": { qty: 1, netValue: 5 },
    });
  });
});

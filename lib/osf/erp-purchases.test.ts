import { describe, expect, it } from "vitest";

import {
  accumulateLastPurchasesFromRows,
  buildSupplierAllowlist,
  isAllowedSupplier,
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
});

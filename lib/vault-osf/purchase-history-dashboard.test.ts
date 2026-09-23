import { describe, expect, it } from "vitest";

import {
  cosmoDbLineToRaw,
  enrichPurchaseHistoryRow,
  erpInvoiceLineToRaw,
  erpReceiptLineToRaw,
  matchesPurchaseHistoryFilters,
  mergePurchaseHistoryLines,
  purchaseHistoryDedupeKey,
  summarizePurchaseHistoryRows,
  type PurchaseHistoryRawLine,
} from "@/lib/vault-osf/purchase-history-dashboard";

const baseCosmo: PurchaseHistoryRawLine = {
  sku: "SKU1",
  supplier: "Supp A",
  postingDate: "2026-05-01",
  qty: 10,
  rate: 100,
  netValue: 1000,
  sourceRef: "ACC-PINV-001",
  source: "cosmo",
};

describe("purchaseHistoryDedupeKey", () => {
  it("prefers sourceRef + sku", () => {
    expect(purchaseHistoryDedupeKey(baseCosmo)).toBe("ref:acc-pinv-001|sku1");
  });

  it("falls back without sourceRef", () => {
    const key = purchaseHistoryDedupeKey({ ...baseCosmo, sourceRef: null });
    expect(key).toBe("fb:sku1|2026-05-01|supp a|10|100");
  });
});

describe("mergePurchaseHistoryLines", () => {
  it("lets ERP invoice override Cosmo on same key", () => {
    const cosmo = [baseCosmo];
    const erp: PurchaseHistoryRawLine[] = [
      {
        ...baseCosmo,
        source: "erp_invoice",
        rate: 120,
        netValue: 1200,
      },
    ];
    const merged = mergePurchaseHistoryLines(cosmo, erp);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.source).toBe("erp_invoice");
    expect(merged[0]!.rate).toBe(120);
  });

  it("keeps Cosmo-only rows", () => {
    const cosmo = [baseCosmo, { ...baseCosmo, sku: "SKU2", sourceRef: null }];
    const merged = mergePurchaseHistoryLines(cosmo, []);
    expect(merged).toHaveLength(2);
    expect(merged.every((r) => r.source === "cosmo")).toBe(true);
  });

  it("lets invoice override receipt on same dedupe key", () => {
    const receipt: PurchaseHistoryRawLine = {
      ...baseCosmo,
      source: "erp_receipt",
      rate: 90,
    };
    const invoice: PurchaseHistoryRawLine = {
      ...baseCosmo,
      source: "erp_invoice",
      rate: 110,
    };
    const merged = mergePurchaseHistoryLines([], [invoice], [receipt]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.source).toBe("erp_invoice");
    expect(merged[0]!.rate).toBe(110);
  });
});

describe("enrichPurchaseHistoryRow", () => {
  it("computes sell and margin from catalog", () => {
    const row = enrichPurchaseHistoryRow(baseCosmo, {
      productTitle: "Item",
      brand: "BrandX",
      mrp: 200,
      discountedPrice: 180,
    });
    expect(row.selling).toBe(200);
    expect(row.marginPct).toBeCloseTo(0.5);
    expect(row.brand).toBe("BrandX");
  });

  it("leaves margin blank when catalog sell missing", () => {
    const row = enrichPurchaseHistoryRow(baseCosmo, {
      productTitle: null,
      brand: null,
      mrp: null,
      discountedPrice: null,
    });
    expect(row.selling).toBeNull();
    expect(row.marginPct).toBeNull();
  });
});

describe("matchesPurchaseHistoryFilters", () => {
  it("filters by brand case-insensitively", () => {
    const ok = matchesPurchaseHistoryFilters(
      baseCosmo,
      { productTitle: "x", brand: "Acme", mrp: 1, discountedPrice: null },
      { from: "2026-01-01", to: "2026-12-31", brand: "acme" },
    );
    expect(ok).toBe(true);
    const no = matchesPurchaseHistoryFilters(
      baseCosmo,
      { productTitle: "x", brand: "Other", mrp: 1, discountedPrice: null },
      { from: "2026-01-01", to: "2026-12-31", brand: "acme" },
    );
    expect(no).toBe(false);
  });

  it("filters by item description contains", () => {
    const ok = matchesPurchaseHistoryFilters(
      baseCosmo,
      { productTitle: "Omega-3 Softgels", brand: "Acme", mrp: 1, discountedPrice: null },
      { from: "2026-01-01", to: "2026-12-31", description: "omega" },
    );
    expect(ok).toBe(true);
    const no = matchesPurchaseHistoryFilters(
      baseCosmo,
      { productTitle: "Biotin Softgels", brand: "Acme", mrp: 1, discountedPrice: null },
      { from: "2026-01-01", to: "2026-12-31", description: "omega" },
    );
    expect(no).toBe(false);
  });
});

describe("erpInvoiceLineToRaw / erpReceiptLineToRaw", () => {
  it("skips invoice zero rates and returns", () => {
    expect(
      erpInvoiceLineToRaw({
        name: "PINV-1",
        item_code: "SKU1",
        posting_date: "2026-05-01",
        qty: 1,
        rate: 0,
        docstatus: 1,
        supplier: "S",
      }),
    ).toBeNull();
    expect(
      erpInvoiceLineToRaw({
        name: "PINV-1",
        item_code: "SKU1",
        posting_date: "2026-05-01",
        qty: 1,
        rate: 50,
        docstatus: 1,
        is_return: 1,
        supplier: "S",
      }),
    ).toBeNull();
  });

  it("keeps receipt lines with zero rate", () => {
    const raw = erpReceiptLineToRaw({
      name: "MAT-PRE-1",
      item_code: "SKU1",
      posting_date: "2026-09-22",
      qty: 3,
      rate: 0,
      net_amount: 0,
      docstatus: 1,
      supplier: "Jana",
      is_return: 0,
    });
    expect(raw).not.toBeNull();
    expect(raw!.source).toBe("erp_receipt");
    expect(raw!.rate).toBe(0);
  });
});

describe("cosmoDbLineToRaw + summarize", () => {
  it("summarizes cost and margin coverage", () => {
    const raw = cosmoDbLineToRaw({
      sku: "A",
      supplier: "S",
      postingDate: "2026-04-01",
      qty: 2,
      rate: 10,
      netValue: 20,
      sourceRef: null,
    });
    const withMargin = enrichPurchaseHistoryRow(raw, {
      productTitle: "t",
      brand: "b",
      mrp: 20,
      discountedPrice: null,
    });
    const noMargin = enrichPurchaseHistoryRow(raw, {
      productTitle: null,
      brand: null,
      mrp: null,
      discountedPrice: null,
    });
    const summary = summarizePurchaseHistoryRows([withMargin, noMargin]);
    expect(summary.lineCount).toBe(2);
    expect(summary.costSum).toBe(40);
    expect(summary.marginLineCount).toBe(1);
  });
});

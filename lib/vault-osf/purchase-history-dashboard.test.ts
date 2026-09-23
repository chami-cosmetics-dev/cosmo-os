import { describe, expect, it } from "vitest";

import {
  cosmoDbLineToRaw,
  enrichPurchaseHistoryRow,
  erpInvoiceLineToRaw,
  isIntercompanyPurchaseSupplier,
  matchesPurchaseHistoryFilters,
  mergePurchaseHistoryLines,
  purchaseHistoryDedupeKey,
  purchaseHistoryErpSlot,
  purchaseHistoryExportSheetRows,
  purchaseInvoiceFormUrl,
  selectPurchaseHistoryErpInstances,
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
  it("prefers sourceRef + sku + company + erp", () => {
    expect(purchaseHistoryDedupeKey(baseCosmo)).toBe("ref:acc-pinv-001|sku1||");
    expect(
      purchaseHistoryDedupeKey({
        ...baseCosmo,
        company: "SupplementVault.lk",
        erpSlot: "ERP1",
      }),
    ).toBe("ref:acc-pinv-001|sku1|supplementvault.lk|erp1");
  });

  it("falls back without sourceRef", () => {
    const key = purchaseHistoryDedupeKey({ ...baseCosmo, sourceRef: null });
    expect(key).toBe("fb:sku1|2026-05-01|supp a|10|100||");
  });
});

describe("isIntercompanyPurchaseSupplier", () => {
  it("matches supplier codes and cash names", () => {
    expect(isIntercompanyPurchaseSupplier("SV029", "Cash OR 001")).toBe(true);
    expect(isIntercompanyPurchaseSupplier("SV030", null)).toBe(true);
    expect(isIntercompanyPurchaseSupplier("SV031", "Cash AE 001")).toBe(true);
    expect(isIntercompanyPurchaseSupplier(null, "SV Cash Cos 006")).toBe(true);
    expect(isIntercompanyPurchaseSupplier(null, "Cash OR 001 - SV029")).toBe(true);
    expect(isIntercompanyPurchaseSupplier("Jana", "Jana Cosmetics")).toBe(false);
  });
});

describe("selectPurchaseHistoryErpInstances", () => {
  const erp1 = {
    id: "erp1",
    label: "ERP_1 - Main",
    baseUrl: "https://cosmetics-lk-01.m.frappe.cloud",
  };
  const erp2 = {
    id: "erp2",
    label: "ERP_2 - Main",
    baseUrl: "https://lwk.example.com",
  };

  it("keeps every instance on both OS", () => {
    expect(selectPurchaseHistoryErpInstances([erp2, erp1]).map((row) => row.id)).toEqual([
      "erp2",
      "erp1",
    ]);
  });

  it("maps instance ids to ERP1 / ERP2", () => {
    expect(purchaseHistoryErpSlot("erp1", { erp1Id: "erp1", erp2Id: "erp2" })).toBe("ERP1");
    expect(purchaseHistoryErpSlot("erp2", { erp1Id: "erp1", erp2Id: "erp2" })).toBe("ERP2");
  });
});

describe("purchaseInvoiceFormUrl", () => {
  it("builds the ERP form URL", () => {
    expect(purchaseInvoiceFormUrl("https://erp.example.com/", "ACC-PINV-001")).toBe(
      "https://erp.example.com/app/purchase-invoice/ACC-PINV-001",
    );
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
        invoiceUrl: "https://erp.example.com/app/purchase-invoice/ACC-PINV-001",
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

  it("drops intercompany Cosmo suppliers", () => {
    const cosmo = [
      baseCosmo,
      { ...baseCosmo, sku: "SKU2", sourceRef: null, supplier: "Cash SV 001" },
    ];
    const merged = mergePurchaseHistoryLines(cosmo, []);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.supplier).toBe("Supp A");
  });
});

describe("enrichPurchaseHistoryRow", () => {
  it("computes sell and margin from catalog", () => {
    const row = enrichPurchaseHistoryRow(baseCosmo, {
      productTitle: "Item",
      brand: "BrandX",
      priority: "Top Priority",
      mrp: 200,
      discountedPrice: 180,
    });
    expect(row.selling).toBe(200);
    expect(row.marginPct).toBeCloseTo(0.5);
    expect(row.brand).toBe("BrandX");
    expect(row.priority).toBe("Top Priority");
  });

  it("leaves margin blank when catalog sell missing", () => {
    const row = enrichPurchaseHistoryRow(baseCosmo, {
      productTitle: null,
      brand: null,
      priority: null,
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
      { productTitle: "x", brand: "Acme", priority: null, mrp: 1, discountedPrice: null },
      { from: "2026-01-01", to: "2026-12-31", brand: "acme" },
    );
    expect(ok).toBe(true);
    const no = matchesPurchaseHistoryFilters(
      baseCosmo,
      { productTitle: "x", brand: "Other", priority: null, mrp: 1, discountedPrice: null },
      { from: "2026-01-01", to: "2026-12-31", brand: "acme" },
    );
    expect(no).toBe(false);
  });

  it("filters by item description contains", () => {
    const ok = matchesPurchaseHistoryFilters(
      baseCosmo,
      {
        productTitle: "Omega-3 Softgels",
        brand: "Acme",
        priority: null,
        mrp: 1,
        discountedPrice: null,
      },
      { from: "2026-01-01", to: "2026-12-31", description: "omega" },
    );
    expect(ok).toBe(true);
    const no = matchesPurchaseHistoryFilters(
      baseCosmo,
      {
        productTitle: "Biotin Softgels",
        brand: "Acme",
        priority: null,
        mrp: 1,
        discountedPrice: null,
      },
      { from: "2026-01-01", to: "2026-12-31", description: "omega" },
    );
    expect(no).toBe(false);
  });

  it("ignores date range when SKU is set", () => {
    const outside = matchesPurchaseHistoryFilters(
      { ...baseCosmo, postingDate: "2024-03-15" },
      { productTitle: "x", brand: "Acme", priority: null, mrp: 1, discountedPrice: null },
      { from: "2026-06-26", to: "2026-09-23", sku: "SKU1" },
    );
    expect(outside).toBe(true);
    const otherSku = matchesPurchaseHistoryFilters(
      { ...baseCosmo, postingDate: "2024-03-15", sku: "OTHER" },
      { productTitle: "x", brand: "Acme", priority: null, mrp: 1, discountedPrice: null },
      { from: "2026-06-26", to: "2026-09-23", sku: "SKU1" },
    );
    expect(otherSku).toBe(false);
  });

  it("filters by company and ERP slot", () => {
    const line = {
      ...baseCosmo,
      company: "Origins (PVT) LTD",
      erpSlot: "ERP2" as const,
    };
    expect(
      matchesPurchaseHistoryFilters(line, undefined, {
        from: "2026-01-01",
        to: "2026-12-31",
        company: "Origins (PVT) LTD",
        erpSlot: "ERP2",
      }),
    ).toBe(true);
    expect(
      matchesPurchaseHistoryFilters(line, undefined, {
        from: "2026-01-01",
        to: "2026-12-31",
        company: "SupplementVault.lk",
      }),
    ).toBe(false);
    expect(
      matchesPurchaseHistoryFilters(line, undefined, {
        from: "2026-01-01",
        to: "2026-12-31",
        erpSlot: "ERP1",
      }),
    ).toBe(false);
  });

  it("filters by priority", () => {
    const ok = matchesPurchaseHistoryFilters(
      baseCosmo,
      {
        productTitle: "x",
        brand: "Acme",
        priority: "Top Priority",
        mrp: 1,
        discountedPrice: null,
      },
      { from: "2026-01-01", to: "2026-12-31", priority: "top priority" },
    );
    expect(ok).toBe(true);
    const no = matchesPurchaseHistoryFilters(
      baseCosmo,
      {
        productTitle: "x",
        brand: "Acme",
        priority: "Non Priority",
        mrp: 1,
        discountedPrice: null,
      },
      { from: "2026-01-01", to: "2026-12-31", priority: "Top Priority" },
    );
    expect(no).toBe(false);
  });
});

describe("erpInvoiceLineToRaw", () => {
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

  it("skips cancelled invoices and intercompany suppliers", () => {
    expect(
      erpInvoiceLineToRaw({
        name: "PINV-1",
        item_code: "SKU1",
        posting_date: "2026-05-01",
        qty: 1,
        rate: 50,
        docstatus: 2,
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
        status: "Cancelled",
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
        supplier: "SV029",
        supplier_name: "Cash OR 001",
      }),
    ).toBeNull();
  });

  it("keeps submitted invoices and attaches ERP form URL", () => {
    const raw = erpInvoiceLineToRaw(
      {
        name: "ACC-PINV-9",
        item_code: "SKU1",
        posting_date: "2026-09-22",
        qty: 3,
        rate: 40,
        net_amount: 120,
        docstatus: 1,
        supplier: "Jana",
        supplier_name: "Jana Cosmetics",
        company: "SupplementVault.lk",
        is_return: 0,
      },
      "https://erp.example.com/",
      { erpSlot: "ERP1" },
    );
    expect(raw).not.toBeNull();
    expect(raw!.source).toBe("erp_invoice");
    expect(raw!.rate).toBe(40);
    expect(raw!.company).toBe("SupplementVault.lk");
    expect(raw!.erpSlot).toBe("ERP1");
    expect(raw!.invoiceUrl).toBe(
      "https://erp.example.com/app/purchase-invoice/ACC-PINV-9",
    );
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
      priority: "Priority",
      mrp: 20,
      discountedPrice: null,
    });
    const noMargin = enrichPurchaseHistoryRow(raw, {
      productTitle: null,
      brand: null,
      priority: null,
      mrp: null,
      discountedPrice: null,
    });
    const summary = summarizePurchaseHistoryRows([withMargin, noMargin]);
    expect(summary.lineCount).toBe(2);
    expect(summary.costSum).toBe(40);
    expect(summary.marginLineCount).toBe(1);
  });
});

describe("purchaseHistoryExportSheetRows", () => {
  it("maps filtered rows to export columns", () => {
    const raw = cosmoDbLineToRaw({
      sku: "A",
      supplier: "S",
      postingDate: "2026-04-01",
      qty: 2,
      rate: 10,
      netValue: 20,
      sourceRef: "PO-1",
      excelCompany: "SupplementVault.lk",
    });
    const row = enrichPurchaseHistoryRow(
      { ...raw, erpSlot: "ERP1" },
      { productTitle: "Item", brand: "B", priority: "Top Priority", mrp: 20, discountedPrice: null },
    );
    expect(purchaseHistoryExportSheetRows([row])).toEqual([
      {
        Date: "2026-04-01",
        SKU: "A",
        Brand: "B",
        Priority: "Top Priority",
        Item: "Item",
        Supplier: "S",
        Company: "SupplementVault.lk",
        Qty: 2,
        Cost: 10,
        Amount: 20,
        Sell: 20,
        "Margin %": 50,
        Source: "File",
        ERP: "ERP1",
        Invoice: "PO-1",
      },
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { companyLocation: { findMany: vi.fn() }, productItem: { findMany: vi.fn() } } }));
vi.mock("@/lib/osf/erp-stock", () => ({ getAllOsfErpInstances: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { loadInventoryAgeing } from "./load";

describe("inventory ageing ERP loading", () => {
  beforeEach(() => {
    vi.mocked(prisma.companyLocation.findMany).mockResolvedValue([{ erpnextCompany: "COS", erpnextInstanceId: "ERP1", supplierPrefix: "INT" }] as never);
    vi.mocked(prisma.productItem.findMany).mockResolvedValue([{ sku: "SKU1", barcode: "123" }] as never);
    vi.mocked(getAllOsfErpInstances).mockResolvedValue([{ id: "ERP1", label: "ERP1", cfg: { baseUrl: "https://erp.example", apiKey: "key", apiSecret: "secret" } }]);
  });

  it("loads receipt and linked invoice item fields through parent permissions", async () => {
    const calledDoctypes: string[] = [];
    let ledgerAttempts = 0;
    const fakeFetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const path = decodeURIComponent(url.pathname);
      const doctype = path.replace("/api/resource/", "").split("/")[0]!;
      calledDoctypes.push(doctype);
      if (doctype === "Stock Ledger Entry" && ++ledgerAttempts === 1) throw new TypeError("fetch failed", { cause: new Error("UND_ERR_SOCKET") });
      const data = doctype === "Company" ? [{ name: "COS", default_currency: "LKR" }]
        : doctype === "Stock Ledger Entry" ? [{ name: "SLE1", company: "COS", item_code: "SKU1", warehouse: "Main", posting_date: "2026-11-01", posting_time: "10:00:00", creation: "2026-11-01 10:00:00", actual_qty: 10, qty_after_transaction: 10, voucher_type: "Purchase Receipt", voucher_no: "PR1", voucher_detail_no: "PRI1", is_cancelled: 0 }]
        : doctype === "Purchase Receipt" ? [{ name: "PR1", company: "COS", supplier: "Supplier A", supplier_name: "Supplier A", creation: "2026-11-01 10:00:00", docstatus: 1, is_return: 0, pr_item_name: "PRI1", item_code: "SKU1", stock_qty: 10, stock_uom: "Nos" }]
        : doctype === "Purchase Invoice" ? [{ name: "PI1", pi_item_name: "PII1", company: "COS", supplier: "Supplier A", posting_date: "2026-11-02", creation: "2026-11-02 10:00:00", docstatus: 1, purchase_receipt: "PR1", pr_detail: "PRI1", item_code: "SKU1", stock_qty: 10, base_net_amount: 100 }]
        : doctype === "Item" ? [{ name: "SKU1", item_name: "Item 1", brand: "Brand A", stock_uom: "Nos" }]
        : doctype === "Item Price" ? [{ name: "PRICE1", item_code: "SKU1", price_list: "Standard Selling", uom: "Nos", price_list_rate: 20, currency: "LKR" }]
        : [];
      return { ok: true, json: async () => ({ data }) } as Response;
    });
    vi.stubGlobal("fetch", fakeFetch);
    try {
      const progress: string[] = [];
      const report = await loadInventoryAgeing("company-id", "2026-11-19", (update) => progress.push(update.status));
      expect(calledDoctypes).not.toContain("Purchase Receipt Item");
      expect(calledDoctypes).not.toContain("Purchase Invoice Item");
      expect(ledgerAttempts).toBe(2);
      expect(report.items[0]?.totalStockLeft).toBe(10);
      expect(report.items[0]?.totalCost).toBe(100);
      expect(report.items[0]?.sellingRate).toBe(20);
      expect(report.items[0]?.barcode).toBe("123");
      expect(progress).toContain("Allocating remaining stock and calculating ageing");
      expect(progress.some((status) => status.startsWith("Loading stock ledger for COS"))).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
});

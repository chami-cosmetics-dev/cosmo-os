import { describe, expect, it } from "vitest";

import { STOCK_REQUEST_EXPORT_HEADERS, stockRequestExportRow } from "./export";
import type { StockRequestItem } from "./types";

const item: StockRequestItem = {
  id: "sr1",
  createdAt: "2026-10-22T04:00:00.000Z",
  sku: "TK02_1",
  productTitle: "Conditioner",
  variantTitle: "250ml",
  productUrl: "https://example.com/p",
  customerName: "Nimal",
  customerEmail: "nimal@example.com",
  customerPhone: "0771234567",
  status: "contacted",
  remark: "Call after 4",
  soldFromInstanceId: "erp1",
  soldFromWarehouse: "Main",
  stockLookupStatus: "found",
  stockLookupAt: "2026-10-22T04:05:00.000Z",
  stockSources: [
    {
      instanceId: "erp1",
      instanceLabel: "ERP1",
      erpCompany: "Cosmo",
      warehouse: "Main",
      availableQty: 3,
      actualQty: 3,
      reservedQty: 0,
      projectedQty: 3,
    },
  ],
  stockLookupError: null,
  availabilityEmailSentAt: null,
  restockEmailSentAt: null,
  restockEmailError: null,
  restockedAt: null,
  restockedWarehouse: null,
  awaitingStock: false,
  source: "shopify",
  createdBy: null,
  lastActionAt: "2026-10-22T04:10:00.000Z",
  lastActionBy: { id: "u9", name: "Admin", email: "a@example.com" },
};

describe("stockRequestExportRow", () => {
  it("maps list fields onto the spreadsheet headers", () => {
    const row = stockRequestExportRow(item);
    expect(Object.keys(row)).toEqual([...STOCK_REQUEST_EXPORT_HEADERS]);
    expect(row.Status).toBe("Contacted");
    expect(row.Source).toBe("Website");
    expect(row["Customer name"]).toBe("Nimal");
    expect(row.SKU).toBe("TK02_1");
    expect(row.Stock).toBe("Stock in other warehouses");
    expect(row["Warehouses with stock"]).toBe("Main (3)");
    expect(row["Sold from"]).toBe("Main");
    expect(row["Last updated by"]).toBe("Admin");
    expect(row["Awaiting stock"]).toBe("");
  });

  it("labels staff and imported sources", () => {
    expect(stockRequestExportRow({ ...item, source: "staff" }).Source).toBe("Staff");
    expect(stockRequestExportRow({ ...item, source: "import" }).Source).toBe("Imported");
  });
});

import { describe, expect, it } from "vitest";

import {
  classifyFailedErpSyncError,
  formatFailedErpSyncErrorMessage,
  looksLikeItemSku,
  parseOutOfStockItemFromError,
  resolveOutOfStockItemFromError,
} from "@/lib/failed-erp-sync-classification";

describe("looksLikeItemSku", () => {
  it("accepts Vault-style item codes", () => {
    expect(looksLikeItemSku("CT028-1")).toBe(true);
    expect(looksLikeItemSku("NW005-1")).toBe(true);
  });

  it("rejects full product titles", () => {
    expect(looksLikeItemSku("Centrum Advance 50+ Adults Multivitamin 150 Tablets")).toBe(false);
  });
});

describe("parseOutOfStockItemFromError", () => {
  it("extracts SKU from href when stored error is only a product title", () => {
    const parsed = parseOutOfStockItemFromError(
      "Out of stock - Centrum Advance 50+ Adults Multivitamin 150 Tablets",
    );
    expect(parsed).toEqual({
      sku: "",
      itemName: "Centrum Advance 50+ Adults Multivitamin 150 Tablets",
    });
  });

  it("parses formatted SKU (name) messages", () => {
    expect(
      parseOutOfStockItemFromError("Out of stock - NW005-1 (Now Glutathione 500mg 30 Veg Capsules)"),
    ).toEqual({
      sku: "NW005-1",
      itemName: "Now Glutathione 500mg 30 Veg Capsules",
    });
  });
});

describe("resolveOutOfStockItemFromError", () => {
  it("resolves SKU from order line items when error only has product title", () => {
    const resolved = resolveOutOfStockItemFromError(
      "Out of stock - Centrum Advance 50+ Adults Multivitamin 150 Tablets",
      [
        {
          sku: "CT028-1",
          productTitle: "Centrum Advance 50+ Adults Multivitamin 150 Tablets",
          variantTitle: null,
        },
      ],
    );
    expect(resolved).toEqual({
      sku: "CT028-1",
      itemName: "Centrum Advance 50+ Adults Multivitamin 150 Tablets",
    });
  });
});

describe("formatFailedErpSyncErrorMessage", () => {
  it("formats ERPNext NegativeStockError with HTML item links", () => {
    const raw =
      'ERPNext POST /api/resource/Sales Invoice [417]: {"exc_type":"NegativeStockError","exception":"erpnext.stock.stock_ledger.NegativeStockError: 1.0 units of <a href=\\"/app/Form/Item/NW005-1\\">Item NW005-1: Now Glutathione 500mg 30 Veg Capsules</a> needed in <a href=\\"/app/Form/Warehouse/Main Warehouse - SV-1\\">Warehouse Main Warehouse - SV-1</a>"}';

    expect(formatFailedErpSyncErrorMessage(raw)).toBe(
      "Out of stock - NW005-1 (Now Glutathione 500mg 30 Veg Capsules)"
    );
  });

  it("leaves unrelated errors unchanged apart from whitespace normalization", () => {
    expect(formatFailedErpSyncErrorMessage("Item code ABC   not found")).toBe("Item code ABC not found");
  });
});

describe("classifyFailedErpSyncError", () => {
  it("marks negative stock as non-retryable", () => {
    const result = classifyFailedErpSyncError("Out of stock - NW005-1");
    expect(result.type).toBe("Out of stock");
    expect(result.retryable).toBe(false);
  });
});

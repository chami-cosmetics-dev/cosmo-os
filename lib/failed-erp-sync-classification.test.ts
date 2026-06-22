import { describe, expect, it } from "vitest";

import {
  classifyFailedErpSyncError,
  formatFailedErpSyncErrorMessage,
} from "@/lib/failed-erp-sync-classification";

describe("formatFailedErpSyncErrorMessage", () => {
  it("formats ERPNext NegativeStockError with HTML item links", () => {
    const raw =
      'ERPNext POST /api/resource/Sales Invoice [417]: {"exc_type":"NegativeStockError","exception":"erpnext.stock.stock_ledger.NegativeStockError: 1.0 units of <a href=\\"/app/Form/Item/NW005-1\\">Item NW005-1: Now Glutathione 500mg 30 Veg Capsules</a> needed in <a href=\\"/app/Form/Warehouse/Main Warehouse - SV-1\\">Warehouse Main Warehouse - SV-1</a>"}';

    expect(formatFailedErpSyncErrorMessage(raw)).toBe(
      "Out of stock - Now Glutathione 500mg 30 Veg Capsules"
    );
  });

  it("leaves unrelated errors unchanged apart from whitespace normalization", () => {
    expect(formatFailedErpSyncErrorMessage("Item code ABC   not found")).toBe("Item code ABC not found");
  });
});

describe("classifyFailedErpSyncError", () => {
  it("marks negative stock as non-retryable", () => {
    const result = classifyFailedErpSyncError("Out of stock - Now Glutathione 500mg 30 Veg Capsules");
    expect(result.type).toBe("Out of stock");
    expect(result.retryable).toBe(false);
  });
});

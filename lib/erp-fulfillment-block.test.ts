import { describe, expect, it } from "vitest";

import { ERP_SYNC_SUCCESS_CLEAR } from "@/lib/failed-erp-sync-auto-retry";
import {
  ERP_OUT_OF_STOCK_FULFILLMENT_ERROR,
  getErpOutOfStockFulfillmentBlock,
  isErpOutOfStockFulfillmentBlocked,
  linkedVaultOrderSubmittedInvoicePatch,
} from "@/lib/erp-fulfillment-block";

const OOS_ERROR = "Out of stock - NW005-1";

describe("isErpOutOfStockFulfillmentBlocked", () => {
  it("blocks when Cosmo still has an OOS sync error and no real SI", () => {
    expect(
      isErpOutOfStockFulfillmentBlocked({
        erpnextSyncError: OOS_ERROR,
        erpnextInvoiceId: "pending",
      }),
    ).toBe(true);
  });

  it("does not block when ERP SI already linked", () => {
    expect(
      isErpOutOfStockFulfillmentBlocked({
        erpnextSyncError: OOS_ERROR,
        erpnextInvoiceId: "600-002550",
      }),
    ).toBe(false);
  });
});

describe("getErpOutOfStockFulfillmentBlock", () => {
  it("returns generic copy when error has no SKU", () => {
    expect(getErpOutOfStockFulfillmentBlock("NegativeStockError: item unavailable")).toBe(
      ERP_OUT_OF_STOCK_FULFILLMENT_ERROR,
    );
  });

  it("returns null when a real SI is already on the order", () => {
    expect(getErpOutOfStockFulfillmentBlock(OOS_ERROR, "600-002550")).toBeNull();
  });
});

describe("linkedVaultOrderSubmittedInvoicePatch", () => {
  it("links SI and clears Cosmo ERP sync error fields", () => {
    expect(linkedVaultOrderSubmittedInvoicePatch({ invoiceName: "600-002550", customer: "mr Mohomad" })).toEqual({
      erpnextInvoiceId: "600-002550",
      erpnextCustomerId: "mr Mohomad",
      ...ERP_SYNC_SUCCESS_CLEAR,
    });
  });

  it("still clears sync error when ERP customer is missing", () => {
    expect(linkedVaultOrderSubmittedInvoicePatch({ invoiceName: "600-002550" })).toEqual({
      erpnextInvoiceId: "600-002550",
      ...ERP_SYNC_SUCCESS_CLEAR,
    });
  });
});

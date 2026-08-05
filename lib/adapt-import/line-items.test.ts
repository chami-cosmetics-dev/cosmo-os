import { describe, expect, it } from "vitest";

import {
  adaptLineItemsForPurchaseUi,
  mapAdaptLineItemHeaders,
  normalizeAdaptLineItem,
  rowFromAdaptLineItemValues,
} from "@/lib/adapt-import/line-items";

describe("adapt line items", () => {
  it("maps headers and normalizes a product row", () => {
    const map = mapAdaptLineItemHeaders([
      "sales_invoice_master_id",
      "sales_invoice_no",
      "item_id",
      "item_code",
      "item_name",
      "unit_price",
      "quantity",
    ]);
    const row = rowFromAdaptLineItemValues(
      ["34080", "100880", "101", "CB009*OI", "PALMERS Cocoa Butter", "2962.5", "1"],
      map
    );
    expect(normalizeAdaptLineItem(row, 0)).toEqual({
      id: "34080:101:0",
      itemId: "101",
      itemCode: "CB009*OI",
      itemName: "PALMERS Cocoa Butter",
      unitPrice: "2962.5",
      quantity: 1,
    });
  });

  it("skips rows without master id or bad quantity", () => {
    expect(
      normalizeAdaptLineItem(
        {
          salesInvoiceMasterId: null,
          salesInvoiceNo: "1",
          itemId: "1",
          itemCode: "x",
          itemName: "x",
          unitPrice: "1",
          quantity: "1",
        },
        0
      )
    ).toBeNull();
    expect(
      normalizeAdaptLineItem(
        {
          salesInvoiceMasterId: "1",
          salesInvoiceNo: "1",
          itemId: "1",
          itemCode: "x",
          itemName: "x",
          unitPrice: "1",
          quantity: "bad",
        },
        0
      )
    ).toBeNull();
  });

  it("maps stored JSON to purchase UI shape", () => {
    expect(
      adaptLineItemsForPurchaseUi([
        {
          id: "1:2:0",
          itemId: "2",
          itemCode: "SKU1",
          itemName: "Serum",
          unitPrice: "1000",
          quantity: 2,
        },
      ])
    ).toEqual([
      {
        id: "1:2:0",
        quantity: 2,
        price: "1000",
        productTitle: "Serum",
        variantTitle: null,
        sku: "SKU1",
      },
    ]);
  });
});

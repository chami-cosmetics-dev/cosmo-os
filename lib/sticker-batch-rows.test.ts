import { describe, expect, it } from "vitest";

import {
  isBlankStickerBatchRow,
  isCompleteStickerBatchRow,
  stickerBatchRowsAllowSave,
} from "@/lib/sticker-batch-rows";

function row(
  patch: Partial<{
    locationId: string;
    itemCode: string;
    itemName: string;
    unitPrice: string;
    quantity: string;
    manufactureDate: string;
    expireDate: string;
  }>
) {
  return {
    locationId: "",
    itemCode: "",
    itemName: "",
    unitPrice: "",
    quantity: "",
    manufactureDate: "",
    expireDate: "",
    ...patch,
  };
}

const filled = row({
  locationId: "loc-1",
  itemCode: "SKU1",
  itemName: "Item 1",
  unitPrice: "100.00",
  quantity: "2",
});

describe("isBlankStickerBatchRow", () => {
  it("treats location-only rows as blank", () => {
    expect(isBlankStickerBatchRow(row({ locationId: "loc-1" }))).toBe(true);
  });

  it("treats a row with SKU as not blank", () => {
    expect(isBlankStickerBatchRow(row({ itemCode: "SKU1" }))).toBe(false);
  });
});

describe("isCompleteStickerBatchRow", () => {
  it("requires location, sku, name, price, and qty >= 1", () => {
    expect(isCompleteStickerBatchRow(filled)).toBe(true);
    expect(isCompleteStickerBatchRow({ ...filled, quantity: "0" })).toBe(false);
    expect(isCompleteStickerBatchRow({ ...filled, unitPrice: "" })).toBe(false);
    expect(isCompleteStickerBatchRow({ ...filled, locationId: "" })).toBe(false);
  });
});

describe("stickerBatchRowsAllowSave", () => {
  it("enables save when 5 of 10 rows are complete and the rest are blank", () => {
    const rows = [filled, filled, filled, filled, filled, row(), row(), row({ locationId: "loc-1" }), row(), row()];
    expect(stickerBatchRowsAllowSave(rows)).toBe(true);
  });

  it("blocks save when a non-blank row is incomplete", () => {
    const rows = [filled, row({ itemCode: "SKU2", itemName: "Half" }), row(), row()];
    expect(stickerBatchRowsAllowSave(rows)).toBe(false);
  });

  it("blocks save when every row is blank", () => {
    expect(stickerBatchRowsAllowSave([row(), row({ locationId: "loc-1" })])).toBe(false);
  });
});

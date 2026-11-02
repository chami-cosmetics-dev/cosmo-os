import { describe, expect, it } from "vitest";

import {
  findForeignShopRow,
  foreignShopForInvoice,
  foreignShopRowError,
  orderMatchesInvoice,
} from "@/lib/book-notes/order-shop";

const spk = {
  id: "ord_spk",
  companyLocationId: "loc_spk",
  shopLabel: "SPK",
  keys: ["acc-sinv-2026-0001", "inv-spk-1"],
};
const kandy = {
  id: "ord_kandy",
  companyLocationId: "loc_kandy",
  shopLabel: "Kandy",
  keys: ["acc-sinv-2026-0099", "inv-kandy-9"],
};

describe("orderMatchesInvoice", () => {
  it("matches invoice keys case-insensitively", () => {
    expect(orderMatchesInvoice(spk.keys, "ACC-SINV-2026-0001")).toBe(true);
    expect(orderMatchesInvoice(spk.keys, "inv-spk-1")).toBe(true);
    expect(orderMatchesInvoice(spk.keys, "nope")).toBe(false);
    expect(orderMatchesInvoice(spk.keys, "  ")).toBe(false);
  });
});

describe("foreignShopForInvoice", () => {
  it("returns null when the invoice is unknown", () => {
    expect(
      foreignShopForInvoice({
        salesInvoice: "HANDWRITTEN-1",
        selectedLocationId: "loc_spk",
        hits: [spk, kandy],
      }),
    ).toBeNull();
  });

  it("returns null when the invoice belongs to the selected shop", () => {
    expect(
      foreignShopForInvoice({
        salesInvoice: "ACC-SINV-2026-0001",
        selectedLocationId: "loc_spk",
        hits: [spk, kandy],
      }),
    ).toBeNull();
  });

  it("flags an invoice that only exists at another shop", () => {
    expect(
      foreignShopForInvoice({
        salesInvoice: "ACC-SINV-2026-0099",
        selectedLocationId: "loc_spk",
        hits: [spk, kandy],
      }),
    ).toEqual(kandy);
  });
});

describe("findForeignShopRow", () => {
  it("rejects an orderId from another outlet", () => {
    expect(
      findForeignShopRow({
        selectedLocationId: "loc_spk",
        rows: [
          {
            idxNo: "2",
            salesInvoice: "ACC-SINV-2026-0099",
            orderId: "ord_kandy",
          },
        ],
        hits: [spk, kandy],
      }),
    ).toEqual({
      error: foreignShopRowError({
        idxNo: "2",
        salesInvoice: "ACC-SINV-2026-0099",
        shopLabel: "Kandy",
      }),
    });
  });

  it("rejects a typed invoice from another outlet", () => {
    expect(
      findForeignShopRow({
        selectedLocationId: "loc_spk",
        rows: [{ idxNo: "3", salesInvoice: "inv-kandy-9", orderId: null }],
        hits: [spk, kandy],
      })?.error,
    ).toContain("Kandy");
  });

  it("allows this outlet's order and unknown invoices", () => {
    expect(
      findForeignShopRow({
        selectedLocationId: "loc_spk",
        rows: [
          {
            idxNo: "1",
            salesInvoice: "ACC-SINV-2026-0001",
            orderId: "ord_spk",
          },
          { idxNo: "2", salesInvoice: "BOOK-ONLY", orderId: null },
        ],
        hits: [spk, kandy],
      }),
    ).toBeNull();
  });
});

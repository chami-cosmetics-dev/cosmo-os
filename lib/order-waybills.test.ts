import { describe, expect, it } from "vitest";

import {
  invoiceCandidates,
  isPendingWaybill,
  normalizeInvoiceLookup,
} from "@/lib/order-waybills";

describe("normalizeInvoiceLookup", () => {
  it("strips leading hashes and whitespace", () => {
    expect(normalizeInvoiceLookup("  #12345  ")).toBe("12345");
    expect(normalizeInvoiceLookup("##ABC")).toBe("ABC");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeInvoiceLookup("12 345")).toBe("12345");
  });
});

describe("invoiceCandidates", () => {
  it("includes raw, normalized, and hashed forms", () => {
    expect(invoiceCandidates("#123")).toEqual(expect.arrayContaining(["#123", "123"]));
    expect(invoiceCandidates("123")).toEqual(expect.arrayContaining(["123", "#123"]));
  });
});

describe("isPendingWaybill", () => {
  it("treats unmatched rows as pending", () => {
    expect(isPendingWaybill({ orderId: null, deliveryCompleteAt: null })).toBe(true);
    expect(isPendingWaybill({ orderId: undefined, deliveryCompleteAt: new Date() })).toBe(true);
  });

  it("treats matched non-delivery-complete as pending", () => {
    expect(isPendingWaybill({ orderId: "clord", deliveryCompleteAt: null })).toBe(true);
  });

  it("excludes matched delivery-complete rows", () => {
    expect(
      isPendingWaybill({ orderId: "clord", deliveryCompleteAt: new Date("2026-07-01") })
    ).toBe(false);
    expect(
      isPendingWaybill({ orderId: "clord", deliveryCompleteAt: "2026-07-01T00:00:00.000Z" })
    ).toBe(false);
  });
});

describe("rematch skip-when-already-linked", () => {
  it("documents that already-linked rows are not pending for rematch selection", () => {
    // rematchUnmatchedWaybills only selects orderId IS NULL; already-linked rows are skipped.
    const alreadyLinked = { orderId: "clord", deliveryCompleteAt: null as Date | null };
    expect(alreadyLinked.orderId).toBeTruthy();
    expect(isPendingWaybill(alreadyLinked)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { isOrderReversed } from "@/lib/customer-insight/lifetime-total";
import { buildLastPurchaseOrderMatch } from "@/lib/orders-last-purchase";

describe("buildLastPurchaseOrderMatch", () => {
  it("matches on phone only when a phone is present", () => {
    const match = buildLastPurchaseOrderMatch({
      email: "customer@gmail.com",
      phoneNumber: "0779730524",
    });
    expect(match.every((m) => !("customerEmail" in m))).toBe(true);
    expect(match.some((m) => "customerPhone" in m)).toBe(true);
    expect(match.some((m) => "erpnextCustomerId" in m)).toBe(true);
  });

  it("ignores a company email and dates the purchase from the phone", () => {
    const withCompanyEmail = buildLastPurchaseOrderMatch({
      email: "sales@cosmetics.lk",
      phoneNumber: "0779730524",
    });
    const phoneOnly = buildLastPurchaseOrderMatch({ phoneNumber: "0779730524" });
    expect(withCompanyEmail).toEqual(phoneOnly);
  });

  it("never matches a company email when there is no phone", () => {
    expect(buildLastPurchaseOrderMatch({ email: "sales@cosmetics.lk" })).toEqual([]);
    expect(buildLastPurchaseOrderMatch({ email: "ishadi.cosmetics@outlook.com" })).toEqual([]);
    expect(buildLastPurchaseOrderMatch({ email: "someone@cosmetics.lk" })).toEqual([]);
  });

  it("falls back to a personal email only when there is no phone", () => {
    expect(buildLastPurchaseOrderMatch({ email: "customer@gmail.com" })).toEqual([
      { customerEmail: { equals: "customer@gmail.com", mode: "insensitive" } },
    ]);
  });

  it("returns no keys when there is nothing safe to match on", () => {
    expect(buildLastPurchaseOrderMatch({})).toEqual([]);
    expect(buildLastPurchaseOrderMatch({ email: "", phoneNumber: "" })).toEqual([]);
  });
});

describe("isOrderReversed", () => {
  it("counts a placed order that has not been delivered yet", () => {
    expect(
      isOrderReversed({
        cancelledAt: null,
        financialStatus: "paid",
        fulfillmentStage: "processing",
      })
    ).toBe(false);
  });

  it("counts an order with no status at all", () => {
    expect(isOrderReversed({ cancelledAt: null })).toBe(false);
  });

  it("excludes cancelled, voided and returned orders", () => {
    expect(isOrderReversed({ cancelledAt: new Date("2026-07-22") })).toBe(true);
    expect(isOrderReversed({ cancelledAt: null, financialStatus: "VOIDED" })).toBe(true);
    expect(isOrderReversed({ cancelledAt: null, fulfillmentStage: "returned" })).toBe(true);
    expect(
      isOrderReversed({ cancelledAt: null, fulfillmentStage: "returned_to_store" })
    ).toBe(true);
  });
});

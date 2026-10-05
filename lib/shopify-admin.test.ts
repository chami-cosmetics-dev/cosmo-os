import { describe, expect, it } from "vitest";

import { shopifyCancelPayload } from "@/lib/shopify-admin";

describe("shopifyCancelPayload", () => {
  it("emails the customer by default (true cancel)", () => {
    expect(shopifyCancelPayload()).toEqual({ reason: "customer", email: true });
    expect(shopifyCancelPayload({ notifyCustomer: true })).toEqual({
      reason: "customer",
      email: true,
    });
  });

  it("skips Shopify cancel email/SMS on replacement", () => {
    expect(shopifyCancelPayload({ notifyCustomer: false })).toEqual({
      reason: "customer",
      email: false,
    });
  });
});

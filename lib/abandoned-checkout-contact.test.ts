import { describe, expect, it } from "vitest";

import { hasAbandonedCheckoutContacts } from "@/lib/abandoned-checkout-contact";

describe("hasAbandonedCheckoutContacts", () => {
  it("requires both email and phone", () => {
    expect(hasAbandonedCheckoutContacts("a@b.com", "0771234567")).toBe(true);
  });

  it("rejects missing email", () => {
    expect(hasAbandonedCheckoutContacts(null, "0771234567")).toBe(false);
    expect(hasAbandonedCheckoutContacts("", "0771234567")).toBe(false);
    expect(hasAbandonedCheckoutContacts("   ", "0771234567")).toBe(false);
  });

  it("rejects missing phone", () => {
    expect(hasAbandonedCheckoutContacts("a@b.com", null)).toBe(false);
    expect(hasAbandonedCheckoutContacts("a@b.com", "")).toBe(false);
    expect(hasAbandonedCheckoutContacts("a@b.com", "   ")).toBe(false);
  });

  it("rejects both missing", () => {
    expect(hasAbandonedCheckoutContacts(null, null)).toBe(false);
    expect(hasAbandonedCheckoutContacts("", "")).toBe(false);
  });
});

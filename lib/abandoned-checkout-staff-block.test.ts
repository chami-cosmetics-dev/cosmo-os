import { describe, expect, it } from "vitest";

import { isBlockedAbandonedCheckoutEmail } from "@/lib/abandoned-checkout-staff-block";

describe("isBlockedAbandonedCheckoutEmail", () => {
  const staff = new Set(["alice@company.com", "bob@cosmetics.lk"]);

  it("blocks company staff emails case-insensitively", () => {
    expect(isBlockedAbandonedCheckoutEmail("Alice@Company.com", staff)).toBe(true);
    expect(isBlockedAbandonedCheckoutEmail("bob@cosmetics.lk", staff)).toBe(true);
  });

  it("blocks shared merchant emails even if not in staff set", () => {
    expect(isBlockedAbandonedCheckoutEmail("sales@cosmetics.lk", new Set())).toBe(true);
    expect(isBlockedAbandonedCheckoutEmail("someone@cosmetics.lk", new Set())).toBe(true);
    expect(isBlockedAbandonedCheckoutEmail("hpg.inoka@gmail.com", new Set())).toBe(true);
  });

  it("allows normal customer emails", () => {
    expect(isBlockedAbandonedCheckoutEmail("customer@gmail.com", staff)).toBe(false);
  });

  it("allows empty email", () => {
    expect(isBlockedAbandonedCheckoutEmail(null, staff)).toBe(false);
    expect(isBlockedAbandonedCheckoutEmail("", staff)).toBe(false);
  });
});

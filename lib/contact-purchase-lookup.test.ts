import { describe, expect, it } from "vitest";

import {
  buildContactOrderLookupOr,
  emailsForPurchaseLookup,
} from "@/lib/contact-purchase-lookup";

describe("contact purchase lookup", () => {
  it("drops shared merchant emails", () => {
    expect(
      emailsForPurchaseLookup([
        "oshadhi@gmail.com",
        "nirukshi.cosmetics@outlook.com",
        "sales@cosmetics.lk",
      ])
    ).toEqual(["oshadhi@gmail.com"]);
  });

  it("uses phone only when phone present", () => {
    expect(
      buildContactOrderLookupOr({
        phones: ["0777651973", "94777651973"],
        emails: ["nirukshi.cosmetics@outlook.com", "real@ex.com"],
      })
    ).toEqual([{ customerPhone: { in: ["0777651973", "94777651973"] } }]);
  });

  it("falls back to non-merchant emails when no phone", () => {
    expect(
      buildContactOrderLookupOr({
        phones: [],
        emails: ["sales@cosmetics.lk", "customer@ex.com"],
      })
    ).toEqual([{ customerEmail: { equals: "customer@ex.com", mode: "insensitive" } }]);
  });
});

import { describe, expect, it } from "vitest";

import {
  buildContactOrderLookupOr,
  contactOrderLookupKeys,
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

  it("uses phone and ERP customer id when phone present", () => {
    expect(
      buildContactOrderLookupOr({
        phones: ["0777651973", "94777651973"],
        emails: ["nirukshi.cosmetics@outlook.com", "real@ex.com"],
      })
    ).toEqual([
      { customerPhone: { in: ["0777651973", "94777651973"] } },
      { erpnextCustomerId: { in: ["0777651973", "94777651973"] } },
    ]);
  });

  it("falls back to non-merchant emails when no phone", () => {
    expect(
      buildContactOrderLookupOr({
        phones: [],
        emails: ["sales@cosmetics.lk", "customer@ex.com"],
      })
    ).toEqual([{ customerEmail: { equals: "customer@ex.com", mode: "insensitive" } }]);
  });

  it("lookup keys drop emails when phone present", () => {
    const keys = contactOrderLookupKeys({
      primaryPhone: "0777651973",
      primaryEmail: "real@ex.com",
    });
    expect(keys.emails).toEqual([]);
    expect(keys.phones).toContain("0777651973");
  });

  it("lookup keys drop shared merchant emails when no phone", () => {
    expect(
      contactOrderLookupKeys({
        primaryEmail: "sales@cosmetics.lk",
        aliasEmails: ["customer@ex.com"],
      })
    ).toEqual({ phones: [], emails: ["customer@ex.com"] });
  });
});

import { describe, expect, it } from "vitest";

import { matchAllocatedMerchantFromUsers } from "@/lib/sms-templates/merchant-contact";

describe("matchAllocatedMerchantFromUsers", () => {
  const users = [
    {
      id: "u1",
      knownName: "Maheshi Priyadarshani",
      name: "Maheshi Priyadarshani Soysa",
      email: "maheshi@example.com",
      couponCodes: ["MER56"],
      mobile: "0779230386",
    },
    {
      id: "u2",
      knownName: "Other",
      name: "Other Person",
      email: "other@example.com",
      couponCodes: ["MER99"],
      mobile: "0770000000",
    },
  ];

  it("matches by known name and returns mobile", () => {
    const hit = matchAllocatedMerchantFromUsers("Maheshi Priyadarshani", users);
    expect(hit.userId).toBe("u1");
    expect(hit.merchantPhone).toBe("0779230386");
    expect(hit.merchantName).toContain("Maheshi");
  });

  it("matches MER code", () => {
    const hit = matchAllocatedMerchantFromUsers("MER56", users);
    expect(hit.userId).toBe("u1");
    expect(hit.merchantPhone).toBe("0779230386");
  });

  it("falls back to label when no user", () => {
    const hit = matchAllocatedMerchantFromUsers("Unknown Merchant", users);
    expect(hit.userId).toBeNull();
    expect(hit.merchantName).toBe("Unknown Merchant");
    expect(hit.merchantPhone).toBe("");
  });

  it("empty assignment yields empty contact", () => {
    expect(matchAllocatedMerchantFromUsers(null, users)).toEqual({
      userId: null,
      merchantName: "",
      merchantPhone: "",
    });
  });
});

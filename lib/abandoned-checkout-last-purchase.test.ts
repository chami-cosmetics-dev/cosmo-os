import { describe, expect, it } from "vitest";

import {
  canonicalAbandonedCheckoutPhone,
  indexLastPurchaseAtByPhone,
  lastPurchaseAtForCheckoutPhones,
  laterPurchaseAt,
  rememberPhonePurchase,
} from "@/lib/abandoned-checkout-last-purchase";

describe("canonicalAbandonedCheckoutPhone", () => {
  it("normalizes +94 and 94 to local 10-digit", () => {
    expect(canonicalAbandonedCheckoutPhone("+94771234567")).toBe("0771234567");
    expect(canonicalAbandonedCheckoutPhone("94771234567")).toBe("0771234567");
    expect(canonicalAbandonedCheckoutPhone("0771234567")).toBe("0771234567");
  });

  it("returns null for blank", () => {
    expect(canonicalAbandonedCheckoutPhone(null)).toBeNull();
    expect(canonicalAbandonedCheckoutPhone("  ")).toBeNull();
  });
});

describe("laterPurchaseAt", () => {
  it("keeps the later date", () => {
    const a = new Date("2026-01-01T00:00:00.000Z");
    const b = new Date("2026-03-15T00:00:00.000Z");
    expect(laterPurchaseAt(a, b)).toEqual(b);
    expect(laterPurchaseAt(b, a)).toEqual(b);
  });

  it("treats null as missing", () => {
    const a = new Date("2026-01-01T00:00:00.000Z");
    expect(laterPurchaseAt(null, a)).toEqual(a);
    expect(laterPurchaseAt(a, null)).toEqual(a);
    expect(laterPurchaseAt(null, null)).toBeNull();
  });
});

describe("indexLastPurchaseAtByPhone", () => {
  it("indexes primary and alias phones", () => {
    const at = new Date("2026-04-01T10:00:00.000Z");
    const map = indexLastPurchaseAtByPhone([
      {
        phoneNumber: "0771111111",
        lastPurchaseAt: at,
        phones: [{ phoneNumber: "+94772222222" }],
      },
    ]);
    expect(map.get("0771111111")).toEqual(at);
    expect(map.get("0772222222")).toEqual(at);
  });

  it("keeps the newest stamp when two contacts share a number", () => {
    const older = new Date("2025-01-01T00:00:00.000Z");
    const newer = new Date("2026-06-01T00:00:00.000Z");
    const map = indexLastPurchaseAtByPhone([
      { phoneNumber: "0771234567", lastPurchaseAt: older },
      { phoneNumber: "+94771234567", lastPurchaseAt: newer },
    ]);
    expect(map.get("0771234567")).toEqual(newer);
  });

  it("skips contacts with no purchase", () => {
    const map = indexLastPurchaseAtByPhone([
      { phoneNumber: "0771234567", lastPurchaseAt: null },
    ]);
    expect(map.has("0771234567")).toBe(false);
  });

  it("uses purchaseLastOrderAt when lastPurchaseAt is empty", () => {
    const at = new Date("2026-05-02T00:00:00.000Z");
    const map = indexLastPurchaseAtByPhone([
      { phoneNumber: "0771234567", lastPurchaseAt: null, purchaseLastOrderAt: at },
    ]);
    expect(map.get("0771234567")).toEqual(at);
  });
});

describe("rememberPhonePurchase", () => {
  it("indexes +94 and local forms so checkout lookup hits", () => {
    const at = new Date("2026-07-01T00:00:00.000Z");
    const map = new Map<string, Date>();
    rememberPhonePurchase(map, "94779119674", at);
    expect(lastPurchaseAtForCheckoutPhones(map, ["0779119674"])).toEqual(at);
    expect(lastPurchaseAtForCheckoutPhones(map, ["+94779119674"])).toEqual(at);
  });
});

describe("lastPurchaseAtForCheckoutPhones", () => {
  it("resolves checkout phone via canonical form", () => {
    const at = new Date("2026-02-20T08:00:00.000Z");
    const index = indexLastPurchaseAtByPhone([
      { phoneNumber: "0771234567", lastPurchaseAt: at },
    ]);
    expect(
      lastPurchaseAtForCheckoutPhones(index, ["+94771234567", "0771234567"])
    ).toEqual(at);
  });

  it("returns null when phone has no contact purchase", () => {
    const index = indexLastPurchaseAtByPhone([]);
    expect(lastPurchaseAtForCheckoutPhones(index, ["0771234567"])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  buildCitypakCreateOrderBody,
  citypakCodAmount,
  matchCitypakAccount,
  normalizeCitypakPrefix,
  toCitypakAscii,
  toCitypakPhone,
} from "@/lib/citypak-api";

describe("toCitypakAscii", () => {
  it("strips non-ascii and caps length", () => {
    expect(toCitypakAscii("Nugegoda  —  LK", 20)).toBe("Nugegoda LK");
    expect(toCitypakAscii("a".repeat(10), 4)).toBe("aaaa");
  });
});

describe("toCitypakPhone", () => {
  it("keeps local 10-digit numbers", () => {
    expect(toCitypakPhone("077-111 1111")).toBe("0771111111");
  });

  it("converts 94 country code to leading 0", () => {
    expect(toCitypakPhone("+94771111111")).toBe("0771111111");
  });
});

describe("citypakCodAmount", () => {
  it("is 0 for prepaid", () => {
    expect(citypakCodAmount("paid", 2500)).toBe(0);
    expect(citypakCodAmount("partially_refunded", "900")).toBe(0);
  });

  it("uses order total for COD", () => {
    expect(citypakCodAmount("pending", "1250.50")).toBe(1250.5);
  });
});

describe("normalizeCitypakPrefix", () => {
  it("maps SV prefixes and Cosmo series", () => {
    expect(normalizeCitypakPrefix("SV200")).toBe("200");
    expect(normalizeCitypakPrefix("6008123")).toBe("600");
    expect(normalizeCitypakPrefix("110001")).toBe("110");
  });
});

describe("matchCitypakAccount", () => {
  const accounts = [
    { invoicePrefix: "600", label: "Cosmetics" },
    { invoicePrefix: "SV200", label: "Origins" },
    { invoicePrefix: "110", label: "DTD" },
  ];

  it("matches Cosmo and Vault prefixes", () => {
    expect(matchCitypakAccount(accounts, "600")?.label).toBe("Cosmetics");
    expect(matchCitypakAccount(accounts, "SV2008123")?.label).toBe("Origins");
    expect(matchCitypakAccount(accounts, "110001")?.label).toBe("DTD");
  });
});

describe("buildCitypakCreateOrderBody", () => {
  it("builds a valid create payload", () => {
    const built = buildCitypakCreateOrderBody({
      token: "204-test-token",
      reference: "6008123",
      receiverName: "Test Customer",
      receiverAddress1: "12 Main St",
      receiverAddress2: "Near temple",
      receiverCity: "Kandy",
      receiverPhone: "0771111111",
      cashOnDeliveryAmount: 1500,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.body.token).toBe("204-test-token");
    expect(built.body.reference).toBe("6008123");
    expect(built.body.to_name).toBe("Test Customer");
    expect(built.body.to_address_line_1).toBe("12 Main St");
    expect(built.body.to_address_line_4).toBe("Kandy");
    expect(built.body.to_contact_1).toBe("0771111111");
    expect(built.body.cash_on_delivery_amount).toBe(1500);
    expect(built.body.weight_g).toBe(500);
    expect(built.body.number_of_pieces).toBe(1);
  });

  it("rejects missing address", () => {
    const built = buildCitypakCreateOrderBody({
      token: "tok",
      reference: "6008123",
      receiverName: "Test",
      receiverAddress1: "",
      receiverAddress2: "",
      receiverCity: "Kandy",
      receiverPhone: "0771111111",
      cashOnDeliveryAmount: 0,
    });
    expect(built.ok).toBe(false);
  });
});

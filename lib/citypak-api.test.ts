import { describe, expect, it } from "vitest";

import {
  buildCitypakCreateOrderBody,
  citypakCodAmount,
  citypakWaybillPdfRequestUrl,
  draftCitypakShipmentFields,
  matchCitypakAccount,
  mergeShippingAddressWithCitypakOverride,
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
  it("is 0 for paid financial status", () => {
    expect(citypakCodAmount("paid", 2500)).toBe(0);
  });

  it("does not treat refund statuses as prepaid (those orders skip dispatch)", () => {
    expect(citypakCodAmount("refunded", "900")).toBe(900);
    expect(citypakCodAmount("partially_refunded", "900")).toBe(900);
  });

  it("is 0 for bank transfer and Koko even if pending", () => {
    expect(
      citypakCodAmount("pending", "2500", { paymentGatewayPrimary: "Bank Transfer" })
    ).toBe(0);
    expect(citypakCodAmount("pending", "1800", { paymentGatewayPrimary: "KOKO" })).toBe(0);
    expect(citypakCodAmount("pending", "900", { paymentGatewayPrimary: "Mintpay" })).toBe(0);
  });

  it("uses order total for COD / cash / card on delivery", () => {
    expect(citypakCodAmount("pending", "1250.50")).toBe(1250.5);
    expect(
      citypakCodAmount("pending", "1250", { paymentGatewayPrimary: "Cash on Delivery (COD)" })
    ).toBe(1250);
    expect(
      citypakCodAmount("pending", "900", { paymentGatewayPrimary: "Card on Delivery" })
    ).toBe(900);
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

describe("citypakWaybillPdfRequestUrl", () => {
  it("builds the Falcon waybill PDF path", () => {
    expect(citypakWaybillPdfRequestUrl("https://falcon.citypak.lk", "12345")).toBe(
      "https://falcon.citypak.lk/customer_api/v1/orders/12345/waybills?page_size=A4&per_page_waybill_count=1"
    );
  });
});

describe("mergeShippingAddressWithCitypakOverride", () => {
  it("keeps extra fields and overwrites receiver lines", () => {
    const merged = mergeShippingAddressWithCitypakOverride(
      { name: "Old", address1: "Old st", city: "Colombo", country: "LK" },
      {
        receiverName: "New Name",
        receiverAddress1: "12 Main",
        receiverAddress2: "Near temple",
        receiverCity: "Kandy",
        receiverPhone: "0771111111",
      }
    );
    expect(merged.name).toBe("New Name");
    expect(merged.address1).toBe("12 Main");
    expect(merged.address2).toBe("Near temple");
    expect(merged.city).toBe("Kandy");
    expect(merged.phone).toBe("0771111111");
    expect(merged.country).toBe("LK");
  });
});

describe("draftCitypakShipmentFields", () => {
  it("prefers shipping name and prepaid COD 0", () => {
    const draft = draftCitypakShipmentFields({
      shippingAddress: {
        name: "Amal",
        address1: "12 Main",
        address2: "Lane 2",
        city: "Kandy",
        phone: "077-222 3333",
      },
      customerPhone: null,
      financialStatus: "pending",
      paymentGatewayPrimary: "Bank Transfer",
      totalPrice: "2500",
    });
    expect(draft.receiverName).toBe("Amal");
    expect(draft.receiverAddress1).toBe("12 Main");
    expect(draft.receiverCity).toBe("Kandy");
    expect(draft.receiverPhone).toBe("0772223333");
    expect(draft.cashOnDeliveryAmount).toBe(0);
  });
});

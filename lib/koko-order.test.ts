import { describe, expect, it } from "vitest";

import {
  canEditKokoLinkTime,
  isErpKokoOrder,
  isErpSourcedOrder,
  isKokoLinkTimeCandidate,
  isKokoPaymentGateway,
  isShopifySourcedOrder,
  isSplitPaymentEligibleSource,
  needsKokoLinkTimeConfirm,
  parseKokoLinkGeneratedAt,
  toColomboPasteValue,
} from "@/lib/koko-order";

describe("isErpSourcedOrder / isShopifySourcedOrder / isKokoPaymentGateway / isErpKokoOrder", () => {
  it("detects erpnext sources", () => {
    expect(isErpSourcedOrder("erpnext")).toBe(true);
    expect(isErpSourcedOrder("erpnext-pos")).toBe(true);
    expect(isErpSourcedOrder("web")).toBe(false);
  });

  it("detects Shopify / web sources", () => {
    expect(isShopifySourcedOrder("web")).toBe(true);
    expect(isShopifySourcedOrder("shopify")).toBe(true);
    expect(isShopifySourcedOrder("erpnext")).toBe(false);
  });

  it("detects KOKO from primary", () => {
    expect(isKokoPaymentGateway({ paymentGatewayPrimary: "Koko: Buy Now Pay Later" })).toBe(true);
    expect(isKokoPaymentGateway({ paymentGatewayPrimary: "Bank Transfer" })).toBe(false);
  });

  it("isErpKokoOrder requires both", () => {
    expect(
      isErpKokoOrder({
        sourceName: "erpnext",
        paymentGatewayPrimary: "Koko",
      }),
    ).toBe(true);
    expect(
      isErpKokoOrder({
        sourceName: "web",
        paymentGatewayPrimary: "Koko",
      }),
    ).toBe(false);
  });

  it("allows split planning on ERP and Shopify", () => {
    expect(isSplitPaymentEligibleSource("erpnext")).toBe(true);
    expect(isSplitPaymentEligibleSource("web")).toBe(true);
    expect(isSplitPaymentEligibleSource("manual")).toBe(false);
  });
});

describe("needsKokoLinkTimeConfirm / canEditKokoLinkTime", () => {
  const afterCutoff = "2026-09-20T10:00:00.000Z";
  const beforeCutoff = "2026-09-18T10:00:00.000Z"; // 2026-09-18 Colombo afternoon
  const cosmo = { vaultOs: false } as const;
  const vault = { vaultOs: true } as const;

  it("needs confirm when ERP KOKO and unconfirmed (post-cutoff, Cosmo)", () => {
    expect(
      needsKokoLinkTimeConfirm(
        {
          sourceName: "erpnext",
          paymentGatewayPrimary: "Koko",
          kokoLinkTimeConfirmedAt: null,
          createdAt: afterCutoff,
        },
        cosmo,
      ),
    ).toBe(true);
  });

  it("needs confirm when Shopify KOKO and unconfirmed (post-cutoff, Cosmo)", () => {
    expect(
      needsKokoLinkTimeConfirm(
        {
          sourceName: "web",
          paymentGatewayPrimary: "Koko",
          kokoLinkTimeConfirmedAt: null,
          createdAt: afterCutoff,
        },
        cosmo,
      ),
    ).toBe(true);
  });

  it("never requires link time on Vault OS", () => {
    expect(
      needsKokoLinkTimeConfirm(
        {
          sourceName: "erpnext",
          paymentGatewayPrimary: "Koko",
          kokoLinkTimeConfirmedAt: null,
          createdAt: afterCutoff,
        },
        vault,
      ),
    ).toBe(false);
    expect(
      isKokoLinkTimeCandidate(
        {
          sourceName: "web",
          paymentGatewayPrimary: "Koko",
          createdAt: afterCutoff,
        },
        vault,
      ),
    ).toBe(false);
  });

  it("does not block pre-cutoff KOKO orders (legacy backlog)", () => {
    expect(
      needsKokoLinkTimeConfirm(
        {
          sourceName: "erpnext",
          paymentGatewayPrimary: "Koko",
          kokoLinkTimeConfirmedAt: null,
          createdAt: beforeCutoff,
        },
        cosmo,
      ),
    ).toBe(false);
    expect(
      isKokoLinkTimeCandidate(
        {
          sourceName: "web",
          paymentGatewayPrimary: "Koko",
          createdAt: beforeCutoff,
        },
        cosmo,
      ),
    ).toBe(false);
  });

  it("needs confirm when Shopify bank has a KOKO split leg (post-cutoff, Cosmo)", () => {
    expect(
      isKokoLinkTimeCandidate(
        {
          sourceName: "web",
          paymentGatewayPrimary: "Bank Transfer",
          hasKokoSplitLeg: true,
          createdAt: afterCutoff,
        },
        cosmo,
      ),
    ).toBe(true);
    expect(
      needsKokoLinkTimeConfirm(
        {
          sourceName: "web",
          paymentGatewayPrimary: "Bank Transfer",
          hasKokoSplitLeg: true,
          kokoLinkTimeConfirmedAt: null,
          createdAt: afterCutoff,
        },
        cosmo,
      ),
    ).toBe(true);
  });

  it("does not need confirm for Shopify bank without KOKO split", () => {
    expect(
      needsKokoLinkTimeConfirm(
        {
          sourceName: "web",
          paymentGatewayPrimary: "Bank Transfer",
          hasKokoSplitLeg: false,
          kokoLinkTimeConfirmedAt: null,
          createdAt: afterCutoff,
        },
        cosmo,
      ),
    ).toBe(false);
  });

  it("does not need confirm after confirmed", () => {
    expect(
      needsKokoLinkTimeConfirm(
        {
          sourceName: "erpnext",
          paymentGatewayPrimary: "Koko",
          kokoLinkTimeConfirmedAt: new Date(),
          createdAt: afterCutoff,
        },
        cosmo,
      ),
    ).toBe(false);
  });

  it("blocks edit after approved payment", () => {
    expect(
      canEditKokoLinkTime(
        {
          sourceName: "web",
          paymentGatewayPrimary: "Koko",
          paymentApprovalStatus: "approved",
          createdAt: afterCutoff,
        },
        cosmo,
      ),
    ).toBe(false);
  });
});

describe("parseKokoLinkGeneratedAt / toColomboPasteValue", () => {
  const expected = new Date("2026-09-18T06:00:00.000Z"); // 11:30 Colombo

  it("parses year-first pasted text as Colombo wall time", () => {
    expect(parseKokoLinkGeneratedAt("2026-09-18 11:30")?.toISOString()).toBe(
      expected.toISOString(),
    );
    expect(parseKokoLinkGeneratedAt("2026-09-18T11:30:00")?.toISOString()).toBe(
      expected.toISOString(),
    );
  });

  it("parses day-first pasted text, with or without meridiem", () => {
    expect(parseKokoLinkGeneratedAt("18/09/2026 11:30 AM")?.toISOString()).toBe(
      expected.toISOString(),
    );
    expect(parseKokoLinkGeneratedAt("18-09-2026 11:30")?.toISOString()).toBe(
      expected.toISOString(),
    );
    expect(parseKokoLinkGeneratedAt("18/09/2026 11:30 PM")?.toISOString()).toBe(
      new Date("2026-09-18T18:00:00.000Z").toISOString(),
    );
  });

  it("honours an explicit offset", () => {
    expect(parseKokoLinkGeneratedAt("2026-09-18T11:30:00+05:30")?.toISOString()).toBe(
      expected.toISOString(),
    );
  });

  it("round-trips through the paste value", () => {
    expect(toColomboPasteValue(parseKokoLinkGeneratedAt("18/09/2026 11:30 AM"))).toBe(
      "2026-09-18 11:30",
    );
  });

  it("rejects empty and unreadable text", () => {
    expect(parseKokoLinkGeneratedAt("")).toBeNull();
    expect(parseKokoLinkGeneratedAt("sometime this morning")).toBeNull();
    expect(parseKokoLinkGeneratedAt("31/02/2026 11:30")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  canEditKokoLinkTime,
  isErpKokoOrder,
  isErpSourcedOrder,
  isKokoPaymentGateway,
  needsKokoLinkTimeConfirm,
  parseKokoLinkGeneratedAt,
  toColomboPasteValue,
} from "@/lib/koko-order";

describe("isErpSourcedOrder / isKokoPaymentGateway / isErpKokoOrder", () => {
  it("detects erpnext sources", () => {
    expect(isErpSourcedOrder("erpnext")).toBe(true);
    expect(isErpSourcedOrder("erpnext-pos")).toBe(true);
    expect(isErpSourcedOrder("web")).toBe(false);
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
});

describe("needsKokoLinkTimeConfirm / canEditKokoLinkTime", () => {
  it("needs confirm when ERP KOKO and unconfirmed", () => {
    expect(
      needsKokoLinkTimeConfirm({
        sourceName: "erpnext",
        paymentGatewayPrimary: "Koko",
        kokoLinkTimeConfirmedAt: null,
      }),
    ).toBe(true);
  });

  it("does not need confirm after confirmed", () => {
    expect(
      needsKokoLinkTimeConfirm({
        sourceName: "erpnext",
        paymentGatewayPrimary: "Koko",
        kokoLinkTimeConfirmedAt: new Date(),
      }),
    ).toBe(false);
  });

  it("blocks edit after approved payment", () => {
    expect(
      canEditKokoLinkTime({
        sourceName: "erpnext",
        paymentGatewayPrimary: "Koko",
        paymentApprovalStatus: "approved",
      }),
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

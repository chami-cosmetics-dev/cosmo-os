import { describe, expect, it } from "vitest";

import {
  canEditKokoLinkTime,
  isErpKokoOrder,
  isErpSourcedOrder,
  isKokoPaymentGateway,
  needsKokoLinkTimeConfirm,
  parseKokoLinkGeneratedAt,
  toColomboDateTimeLocalValue,
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

describe("parseKokoLinkGeneratedAt / toColomboDateTimeLocalValue", () => {
  it("parses datetime-local as Colombo wall time", () => {
    const d = parseKokoLinkGeneratedAt("2026-09-18T11:30");
    expect(d).not.toBeNull();
    expect(toColomboDateTimeLocalValue(d)).toBe("2026-09-18T11:30");
  });

  it("rejects empty", () => {
    expect(parseKokoLinkGeneratedAt("")).toBeNull();
  });
});

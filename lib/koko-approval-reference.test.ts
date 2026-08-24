import { describe, expect, it } from "vitest";

import {
  normalizeKokoReference,
  requiresKokoApprovalReference,
} from "@/lib/koko-approval-reference";

describe("normalizeKokoReference", () => {
  it("trims and normalizes case for company-scoped uniqueness", () => {
    expect(normalizeKokoReference("  koko-AbC-123  ")).toBe("KOKO-ABC-123");
    expect(normalizeKokoReference("abc-1")).toBe(
      normalizeKokoReference(" ABC-1 "),
    );
  });
});

describe("requiresKokoApprovalReference", () => {
  it("requires a reference for incoming KOKO orders", () => {
    expect(
      requiresKokoApprovalReference({
        type: "order_payment_approval",
        paymentGatewayPrimary: "KOKO",
        paymentGatewayNames: [],
      }),
    ).toBe(true);
  });

  it("requires a reference for a split plan even when Bank Transfer is primary", () => {
    expect(
      requiresKokoApprovalReference({
        type: "order_payment_approval",
        paymentGatewayPrimary: "Bank Transfer",
        paymentGatewayNames: [],
        requestNote:
          "Split Payment — amount: LKR 7750.00\nKOKO: LKR 3000.00\nBank Transfer: LKR 4750.00",
      }),
    ).toBe(true);
  });

  it("uses gateway names only when the primary gateway is missing", () => {
    expect(
      requiresKokoApprovalReference({
        type: "order_payment_approval",
        paymentGatewayPrimary: null,
        paymentGatewayNames: ["Koko Installments"],
      }),
    ).toBe(true);
    expect(
      requiresKokoApprovalReference({
        type: "order_payment_approval",
        paymentGatewayPrimary: "cod",
        paymentGatewayNames: ["KOKO"],
      }),
    ).toBe(false);
  });

  it("requires a reference for COD-to-KOKO changes", () => {
    expect(
      requiresKokoApprovalReference({
        type: "payment_method_change_approval",
        requestNote: "KOKO — payment method change request — amount: 1000",
      }),
    ).toBe(true);
  });

  it("protects legacy approvals that default to KOKO", () => {
    expect(
      requiresKokoApprovalReference({
        type: "payment_method_change_approval",
        requestNote: null,
      }),
    ).toBe(true);
    expect(
      requiresKokoApprovalReference({
        type: "order_payment_approval",
        paymentGatewayPrimary: null,
        paymentGatewayNames: [],
        requestNote: "koko — amount: 1000",
      }),
    ).toBe(true);
  });

  it("does not require a reference for non-KOKO approvals", () => {
    expect(
      requiresKokoApprovalReference({
        type: "order_payment_approval",
        paymentGatewayPrimary: "Mintpay",
      }),
    ).toBe(false);
    expect(
      requiresKokoApprovalReference({
        type: "payment_method_change_approval",
        requestNote: "Bank Transfer — payment method change request",
      }),
    ).toBe(false);
    expect(
      requiresKokoApprovalReference({ type: "return_cancel" }),
    ).toBe(false);
  });
});

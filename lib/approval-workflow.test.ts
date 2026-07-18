import { describe, expect, it } from "vitest";

import {
  FINANCE_PENDING_FULFILLMENT_EXCLUSION,
  isActiveErpSiRetryLease,
  isPlaceholderErpInvoiceId,
  isRealErpSalesInvoiceId,
} from "@/lib/approval-workflow";

describe("isPlaceholderErpInvoiceId", () => {
  it("treats null, empty, pending, and pending_approval as placeholders", () => {
    expect(isPlaceholderErpInvoiceId(null)).toBe(true);
    expect(isPlaceholderErpInvoiceId(undefined)).toBe(true);
    expect(isPlaceholderErpInvoiceId("")).toBe(true);
    expect(isPlaceholderErpInvoiceId("   ")).toBe(true);
    expect(isPlaceholderErpInvoiceId("pending")).toBe(true);
    expect(isPlaceholderErpInvoiceId("pending_approval")).toBe(true);
  });

  it("treats real SI names as non-placeholders", () => {
    expect(isPlaceholderErpInvoiceId("SV100-0695")).toBe(false);
    expect(isPlaceholderErpInvoiceId("ACC-SINV-2026-0001")).toBe(false);
  });
});

describe("isRealErpSalesInvoiceId", () => {
  it("is the inverse of isPlaceholderErpInvoiceId", () => {
    expect(isRealErpSalesInvoiceId("SV100-0695")).toBe(true);
    expect(isRealErpSalesInvoiceId("pending")).toBe(false);
    expect(isRealErpSalesInvoiceId(null)).toBe(false);
  });
});

describe("isActiveErpSiRetryLease", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");

  it("is false when lease is missing or expired", () => {
    expect(isActiveErpSiRetryLease(null, now)).toBe(false);
    expect(isActiveErpSiRetryLease(undefined, now)).toBe(false);
    expect(isActiveErpSiRetryLease(new Date("2026-07-18T11:59:00.000Z"), now)).toBe(false);
  });

  it("is true when lease expires in the future", () => {
    expect(isActiveErpSiRetryLease(new Date("2026-07-18T12:01:00.000Z"), now)).toBe(true);
    expect(isActiveErpSiRetryLease("2026-07-18T12:30:00.000Z", now)).toBe(true);
  });

  it("is false for invalid date strings", () => {
    expect(isActiveErpSiRetryLease("not-a-date", now)).toBe(false);
  });
});

describe("FINANCE_PENDING_FULFILLMENT_EXCLUSION", () => {
  it("gates on pending order_payment_approval only (no erpnextInvoiceId key)", () => {
    expect(FINANCE_PENDING_FULFILLMENT_EXCLUSION).toEqual({
      approvalRequests: {
        none: { type: "order_payment_approval", status: "pending" },
      },
    });
    expect(FINANCE_PENDING_FULFILLMENT_EXCLUSION).not.toHaveProperty("erpnextInvoiceId");
    expect(JSON.stringify(FINANCE_PENDING_FULFILLMENT_EXCLUSION)).not.toContain("erpnextInvoiceId");
  });
});

describe("orderPaymentRejectionReasonSchema", () => {
  it("requires trimmed 5–500 characters", async () => {
    const { orderPaymentRejectionReasonSchema } = await import("@/lib/validation");
    expect(orderPaymentRejectionReasonSchema.safeParse("abcd").success).toBe(false);
    expect(orderPaymentRejectionReasonSchema.safeParse("abcde").success).toBe(true);
    expect(orderPaymentRejectionReasonSchema.safeParse("  abcd  ").success).toBe(false);
    expect(orderPaymentRejectionReasonSchema.safeParse("  abcde  ").success).toBe(true);
    expect(orderPaymentRejectionReasonSchema.safeParse("x".repeat(500)).success).toBe(true);
    expect(orderPaymentRejectionReasonSchema.safeParse("x".repeat(501)).success).toBe(false);
  });
});

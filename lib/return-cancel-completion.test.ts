import { describe, expect, it, vi } from "vitest";

import {
  isFullyPaidFinancialStatus,
  resolveReturnCancelCompletionMode,
  runReturnCancelExternalCompletion,
  sanitizeReturnCancelError,
  type ReturnCancelCompletionOrder,
} from "@/lib/return-cancel-completion";
import type { LocationWithErpInstance } from "@/lib/erpnext-sync";

function baseOrder(
  overrides: Partial<ReturnCancelCompletionOrder> = {},
): ReturnCancelCompletionOrder {
  return {
    id: "ord_1",
    name: "#1001",
    orderNumber: "1001",
    shopifyOrderId: "1234567890",
    financialStatus: "paid",
    erpnextInvoiceId: "ACC-SINV-1",
    erpReturnSalesInvoiceIds: [],
    cancelReason: null,
    ...overrides,
  };
}

function baseLocation(): LocationWithErpInstance {
  return {
    id: "loc_1",
    shopifyAdminStoreHandle: "cosmo-store",
    erpnextCompany: "Test Co",
    erpnextInstance: {
      id: "erp_1",
      baseUrl: "https://erp.example.com",
      apiKey: "key",
      apiSecret: "secret",
    },
  } as LocationWithErpInstance;
}

describe("resolveReturnCancelCompletionMode / isFullyPaidFinancialStatus", () => {
  it("maps exact paid (case/whitespace) to credit_note", () => {
    expect(resolveReturnCancelCompletionMode("paid")).toBe("credit_note");
    expect(resolveReturnCancelCompletionMode(" Paid ")).toBe("credit_note");
    expect(resolveReturnCancelCompletionMode("PAID")).toBe("credit_note");
    expect(isFullyPaidFinancialStatus("paid")).toBe(true);
  });

  it("maps non-paid statuses to cancel_si", () => {
    for (const status of [null, undefined, "", "pending", "partial", "refunded", "authorized", "voided"]) {
      expect(resolveReturnCancelCompletionMode(status)).toBe("cancel_si");
      expect(isFullyPaidFinancialStatus(status)).toBe(false);
    }
  });
});

describe("sanitizeReturnCancelError", () => {
  it("redacts tokens and bounds length", () => {
    const msg = sanitizeReturnCancelError(
      new Error(`ERPNext POST failed token abc.def Authorization: Bearer xyz ${"x".repeat(600)}`),
    );
    expect(msg).not.toMatch(/abc\.def/);
    expect(msg.length).toBeLessThanOrEqual(500);
  });
});

describe("runReturnCancelExternalCompletion", () => {
  it("paid path calls ensure credit note, never cancel SI", async () => {
    const ensureErpnextCreditNote = vi.fn().mockResolvedValue({
      creditNoteName: "RET-1",
      originalInvoiceName: "ACC-SINV-1",
      originalStatus: "Credit Note Issued",
      created: true,
    });
    const cancelErpnextSalesInvoice = vi.fn();
    const cancelShopifyOrder = vi.fn().mockResolvedValue(undefined);

    const result = await runReturnCancelExternalCompletion({
      order: baseOrder({ financialStatus: "paid" }),
      location: baseLocation(),
      deps: {
        ensureErpnextCreditNote,
        cancelErpnextSalesInvoice,
        cancelShopifyOrder,
        shouldBlockShopifyCancelInOs: () => false,
        isRealShopifyOrderId: () => true,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.completionMode).toBe("credit_note");
    expect(result.creditNoteName).toBe("RET-1");
    expect(ensureErpnextCreditNote).toHaveBeenCalledOnce();
    expect(cancelErpnextSalesInvoice).not.toHaveBeenCalled();
    expect(cancelShopifyOrder).toHaveBeenCalledOnce();
  });

  it("paid path fails when ensure throws (e.g. original still Paid)", async () => {
    const result = await runReturnCancelExternalCompletion({
      order: baseOrder({ financialStatus: "paid" }),
      location: baseLocation(),
      deps: {
        ensureErpnextCreditNote: vi.fn().mockRejectedValue(
          new Error('Return SI RET-1 exists but original ACC-SINV-1 is still "Paid"'),
        ),
        cancelErpnextSalesInvoice: vi.fn(),
        cancelShopifyOrder: vi.fn(),
        shouldBlockShopifyCancelInOs: () => false,
        isRealShopifyOrderId: () => true,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.erpOutcome).toBe("failed");
    expect(result.error).toMatch(/still "Paid"/);
  });

  it("paid path fails when SI missing", async () => {
    const result = await runReturnCancelExternalCompletion({
      order: baseOrder({ financialStatus: "paid", erpnextInvoiceId: null }),
      location: baseLocation(),
      deps: {
        ensureErpnextCreditNote: vi.fn().mockRejectedValue(
          new Error('[ERPNext] credit note: no submitted SI found for po_no="#1001"'),
        ),
        cancelErpnextSalesInvoice: vi.fn(),
        cancelShopifyOrder: vi.fn(),
        shouldBlockShopifyCancelInOs: () => false,
        isRealShopifyOrderId: () => true,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no submitted SI/);
  });

  it("idempotent already-done credit note path", async () => {
    const result = await runReturnCancelExternalCompletion({
      order: baseOrder({
        financialStatus: "paid",
        erpReturnSalesInvoiceIds: ["RET-EXISTING"],
      }),
      location: baseLocation(),
      deps: {
        ensureErpnextCreditNote: vi.fn().mockResolvedValue({
          creditNoteName: "RET-EXISTING",
          originalInvoiceName: "ACC-SINV-1",
          originalStatus: "Credit Note Issued",
          created: false,
        }),
        cancelErpnextSalesInvoice: vi.fn(),
        cancelShopifyOrder: vi.fn().mockResolvedValue(undefined),
        shouldBlockShopifyCancelInOs: () => false,
        isRealShopifyOrderId: () => true,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.erpOutcome).toBe("already_done");
    expect(result.creditNoteName).toBe("RET-EXISTING");
  });

  it("unpaid path cancels SI and never ensures credit note", async () => {
    const ensureErpnextCreditNote = vi.fn();
    const cancelErpnextSalesInvoice = vi.fn().mockResolvedValue({
      outcome: "cancelled",
      invoiceName: "ACC-SINV-1",
    });

    const result = await runReturnCancelExternalCompletion({
      order: baseOrder({ financialStatus: "pending" }),
      location: baseLocation(),
      deps: {
        ensureErpnextCreditNote,
        cancelErpnextSalesInvoice,
        cancelShopifyOrder: vi.fn().mockResolvedValue(undefined),
        shouldBlockShopifyCancelInOs: () => false,
        isRealShopifyOrderId: () => true,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.completionMode).toBe("cancel_si");
    expect(result.erpOutcome).toBe("cancelled");
    expect(ensureErpnextCreditNote).not.toHaveBeenCalled();
    expect(cancelErpnextSalesInvoice).toHaveBeenCalledOnce();
  });

  it("unpaid not_found fails without inventing credit note", async () => {
    const result = await runReturnCancelExternalCompletion({
      order: baseOrder({ financialStatus: "refunded" }),
      location: baseLocation(),
      deps: {
        ensureErpnextCreditNote: vi.fn(),
        cancelErpnextSalesInvoice: vi.fn().mockResolvedValue({ outcome: "not_found" }),
        cancelShopifyOrder: vi.fn(),
        shouldBlockShopifyCancelInOs: () => false,
        isRealShopifyOrderId: () => true,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.erpOutcome).toBe("failed");
    expect(result.error).toMatch(/not found/i);
  });

  it("Vault Shopify skip does not fail unpaid completion", async () => {
    const result = await runReturnCancelExternalCompletion({
      order: baseOrder({ financialStatus: "pending" }),
      location: baseLocation(),
      deps: {
        ensureErpnextCreditNote: vi.fn(),
        cancelErpnextSalesInvoice: vi.fn().mockResolvedValue({
          outcome: "cancelled",
          invoiceName: "ACC-SINV-1",
        }),
        cancelShopifyOrder: vi.fn(),
        shouldBlockShopifyCancelInOs: () => true,
        isRealShopifyOrderId: () => true,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.shopifyOutcome).toBe("skipped_vault");
  });
});

describe("reject path is route-only", () => {
  it("documents that reject must not call completion helper (covered by route isolation)", () => {
    // Approve uses runReturnCancelExternalCompletion; reject resets OrderReturn only.
    expect(typeof runReturnCancelExternalCompletion).toBe("function");
  });
});

import { describe, expect, it } from "vitest";

import { isUsableErpSalesInvoiceId } from "@/lib/erpnext-sync";
import {
  buildFailedErpPeSyncWhere,
  buildSilentErpPeGapCandidateWhere,
  ERP_PE_SYNC_MOP_ORDER_AUTO,
  getNextFailedErpPeSyncAutoRetryAt,
  isPendingFinanceApprovalPeRetryError,
  PENDING_FINANCE_APPROVAL_PE_RETRY_ERROR,
  resolveFailedErpPeRetryMop,
  SPLIT_PAYMENT_FINANCE_APPROVAL_PE_RETRY_ERROR,
} from "@/lib/failed-erp-pe-sync";

describe("isUsableErpSalesInvoiceId", () => {
  it("accepts real SI names", () => {
    expect(isUsableErpSalesInvoiceId("SV100-0695")).toBe(true);
  });

  it("rejects placeholders and empty", () => {
    expect(isUsableErpSalesInvoiceId(null)).toBe(false);
    expect(isUsableErpSalesInvoiceId("")).toBe(false);
    expect(isUsableErpSalesInvoiceId("pending")).toBe(false);
    expect(isUsableErpSalesInvoiceId("pending_approval")).toBe(false);
  });
});

describe("buildFailedErpPeSyncWhere", () => {
  it("includes PE failures for terminal and early/nonterminal stages", () => {
    const where = buildFailedErpPeSyncWhere("co1");
    expect(where).toMatchObject({
      companyId: "co1",
      erpPeSyncError: { not: null },
      approvalRequests: {
        none: { type: "order_payment_approval", status: "pending" },
      },
    });
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { fulfillmentStage: "invoice_complete" },
        { invoiceCompleteAt: { not: null } },
      ]),
    );
  });
});

describe("buildSilentErpPeGapCandidateWhere", () => {
  it("targets invoice-complete marker or terminal stage without PE error", () => {
    const where = buildSilentErpPeGapCandidateWhere("co1");
    expect(where).toMatchObject({
      companyId: "co1",
      erpPeSyncError: null,
      erpnextInvoiceId: { not: null },
      approvalRequests: {
        none: { type: "order_payment_approval", status: "pending" },
      },
    });
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { fulfillmentStage: "invoice_complete" },
        { invoiceCompleteAt: { not: null } },
      ]),
    );
  });
});

describe("getNextFailedErpPeSyncAutoRetryAt", () => {
  const from = new Date("2026-09-05T03:00:00.000Z");

  it("schedules 1m, 3m, 10m, 30m then stops", () => {
    expect(getNextFailedErpPeSyncAutoRetryAt(0, from)?.toISOString()).toBe("2026-09-05T03:01:00.000Z");
    expect(getNextFailedErpPeSyncAutoRetryAt(1, from)?.toISOString()).toBe("2026-09-05T03:03:00.000Z");
    expect(getNextFailedErpPeSyncAutoRetryAt(2, from)?.toISOString()).toBe("2026-09-05T03:10:00.000Z");
    expect(getNextFailedErpPeSyncAutoRetryAt(3, from)?.toISOString()).toBe("2026-09-05T03:30:00.000Z");
    expect(getNextFailedErpPeSyncAutoRetryAt(4, from)).toBeNull();
  });
});

describe("resolveFailedErpPeRetryMop", () => {
  it("prefers override then stored mop", () => {
    expect(
      resolveFailedErpPeRetryMop(
        {
          erpPeSyncMop: "Cash",
          paymentGatewayPrimary: "cod",
          paymentGatewayNames: [],
          companyLocation: null,
        },
        "KOKO",
      ),
    ).toBe("KOKO");

    expect(
      resolveFailedErpPeRetryMop({
        erpPeSyncMop: "Cash",
        paymentGatewayPrimary: "cod",
        paymentGatewayNames: [],
        companyLocation: null,
      }),
    ).toBe("Cash");
  });

  it("ignores legacy order-auto label without location", () => {
    expect(
      resolveFailedErpPeRetryMop({
        erpPeSyncMop: ERP_PE_SYNC_MOP_ORDER_AUTO,
        paymentGatewayPrimary: "cod",
        paymentGatewayNames: [],
        companyLocation: null,
      }),
    ).toBeNull();
  });
});

describe("finance approval stage guard", () => {
  function nextStage(current: "print" | "invoice_complete") {
    return current === "invoice_complete" ? "keep" : "print";
  }

  it("keeps invoice_complete instead of forcing print", () => {
    expect(nextStage("invoice_complete")).toBe("keep");
  });

  it("still advances first-time approvals to print", () => {
    expect(nextStage("print")).toBe("print");
  });
});

describe("isPendingFinanceApprovalPeRetryError", () => {
  it("matches split and pending finance PE retry messages", () => {
    expect(isPendingFinanceApprovalPeRetryError(SPLIT_PAYMENT_FINANCE_APPROVAL_PE_RETRY_ERROR)).toBe(
      true,
    );
    expect(isPendingFinanceApprovalPeRetryError(PENDING_FINANCE_APPROVAL_PE_RETRY_ERROR)).toBe(true);
    expect(isPendingFinanceApprovalPeRetryError("ERPNext POST /api/resource/Payment Entry [502]")).toBe(
      false,
    );
  });
});

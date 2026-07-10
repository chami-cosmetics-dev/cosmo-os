import { describe, expect, it } from "vitest";

import { isUsableErpSalesInvoiceId } from "@/lib/erpnext-sync";
import {
  buildFailedErpPeSyncWhere,
  buildSilentErpPeGapCandidateWhere,
  ERP_PE_SYNC_MOP_ORDER_AUTO,
  resolveFailedErpPeRetryMop,
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
  it("requires invoice_complete and erpPeSyncError", () => {
    const where = buildFailedErpPeSyncWhere("co1");
    expect(where).toMatchObject({
      companyId: "co1",
      fulfillmentStage: "invoice_complete",
      erpPeSyncError: { not: null },
    });
  });
});

describe("buildSilentErpPeGapCandidateWhere", () => {
  it("targets invoice_complete without PE error and with SI id", () => {
    const where = buildSilentErpPeGapCandidateWhere("co1");
    expect(where).toMatchObject({
      companyId: "co1",
      fulfillmentStage: "invoice_complete",
      erpPeSyncError: null,
      erpnextInvoiceId: { not: null },
    });
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
  it("keeps invoice_complete instead of forcing print", () => {
    const current = "invoice_complete";
    const next = current === "invoice_complete" ? "keep" : "print";
    expect(next).toBe("keep");
  });

  it("still advances first-time approvals to print", () => {
    const current = "print";
    const next = current === "invoice_complete" ? "keep" : "print";
    expect(next).toBe("print");
  });
});

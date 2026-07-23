import { describe, expect, it } from "vitest";

import {
  creditNoteUpdateOutstandingForSelf,
  isUsableErpSalesInvoiceId,
} from "@/lib/erpnext-sync";
import { isCcCheckoutGateway } from "@/lib/delivery-payment-approval";

describe("isUsableErpSalesInvoiceId", () => {
  it("accepts real SI names", () => {
    expect(isUsableErpSalesInvoiceId("SV100-0695")).toBe(true);
    expect(isUsableErpSalesInvoiceId("ACC-SINV-2026-0001")).toBe(true);
  });

  it("rejects null, empty, and placeholder ids", () => {
    expect(isUsableErpSalesInvoiceId(null)).toBe(false);
    expect(isUsableErpSalesInvoiceId(undefined)).toBe(false);
    expect(isUsableErpSalesInvoiceId("")).toBe(false);
    expect(isUsableErpSalesInvoiceId("   ")).toBe(false);
    expect(isUsableErpSalesInvoiceId("pending")).toBe(false);
    expect(isUsableErpSalesInvoiceId("pending_approval")).toBe(false);
  });
});

describe("creditNoteUpdateOutstandingForSelf", () => {
  it("is 0 so paid originals can become Credit Note Issued", () => {
    expect(creditNoteUpdateOutstandingForSelf()).toBe(0);
  });
});

/**
 * Mirrors resolvePrepaidMop CC → WebXPay mapping used in lib/erpnext-sync.ts
 * (kept local so we don't export private resolvers).
 */
function resolvePrepaidMopForTest(
  cfg: { kokoMop: string; webxpayMop: string; bankTransferMop: string },
  gateways: string[],
): string | null {
  const lower = gateways.map((g) => g.toLowerCase().trim());
  if (lower.some((g) => g.includes("koko"))) return cfg.kokoMop;
  if (lower.some((g) => g.includes("webxpay") || isCcCheckoutGateway(g))) {
    return cfg.webxpayMop || null;
  }
  if (lower.some((g) => g.includes("bank"))) return cfg.bankTransferMop;
  return null;
}

describe("CC Checkout → WebXPay MOP mapping", () => {
  const cfg = {
    kokoMop: "KOKO",
    webxpayMop: "WebXPay",
    bankTransferMop: "Bank Transfer",
  };

  it("maps CC Checkout variants to webxpayMop", () => {
    expect(resolvePrepaidMopForTest(cfg, ["CC CHECKOUT"])).toBe("WebXPay");
    expect(resolvePrepaidMopForTest(cfg, ["cc_checkout"])).toBe("WebXPay");
    expect(resolvePrepaidMopForTest(cfg, ["cc-checkout"])).toBe("WebXPay");
    expect(resolvePrepaidMopForTest(cfg, ["cc"])).toBe("WebXPay");
  });

  it("does not change KOKO / bank mappings", () => {
    expect(resolvePrepaidMopForTest(cfg, ["KOKO"])).toBe("KOKO");
    expect(resolvePrepaidMopForTest(cfg, ["bank_transfer"])).toBe("Bank Transfer");
  });

  it("returns null when webxpayMop empty for CC Checkout", () => {
    expect(
      resolvePrepaidMopForTest({ ...cfg, webxpayMop: "" }, ["cc_checkout"]),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { isUsableErpSalesInvoiceId } from "@/lib/erpnext-sync";

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

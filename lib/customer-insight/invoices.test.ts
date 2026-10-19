import { describe, expect, it } from "vitest";

import { mapAdaptToInvoiceRow, normalizePurchaseOrigin, saleBusinessLabel } from "@/lib/customer-insight/invoices";

describe("mapAdaptToInvoiceRow origin", () => {
  const base = {
    id: "row-1",
    invoiceDate: new Date("2024-03-15T00:00:00+05:30"),
    salesInvoiceNo: "INV-1001",
    ttlAmount: 30000,
    currency: "LKR",
  };

  it("labels a supplement import and uses the payment method", () => {
    const row = mapAdaptToInvoiceRow({
      ...base,
      origin: "vault_supplement_import",
      paymentMethod: "Cash",
    });
    expect(row.source).toBe("adapt");
    expect(row.origin).toBe("vault_supplement_import");
    expect(row.secondaryLabel).toBe("Supplement import");
    expect(row.status).toBe("Cash");
    expect(row.financialStatus).toBe("Cash");
    expect(row.includedInLoyaltyTotal).toBe(true);
  });

  it("shows voided and keeps that amount out of the loyalty total", () => {
    const row = mapAdaptToInvoiceRow({
      ...base,
      origin: "vault_supplement_import",
      paymentMethod: "Bank Deposit",
      financialStatus: "voided",
    });
    expect(row.status).toBe("voided");
    expect(row.financialStatus).toBe("voided");
    expect(row.includedInLoyaltyTotal).toBe(false);
    expect(row.amount).toBe(30000);
  });

  it("uses Imported when a supplement payment method is blank", () => {
    const row = mapAdaptToInvoiceRow({
      ...base,
      origin: "vault_supplement_import",
      paymentMethod: "  ",
    });
    expect(row.status).toBe("Imported");
    expect(row.financialStatus).toBe("Imported");
  });

  it("keeps Adapt for an adapt origin", () => {
    const row = mapAdaptToInvoiceRow({ ...base, origin: "adapt" });
    expect(row.secondaryLabel).toBe("Adapt");
    expect(row.status).toBe("Adapt / —");
    expect(row.financialStatus).toBe("Adapt");
    expect(row.origin).toBe("adapt");
    expect(saleBusinessLabel(row.origin)).toBe("Supplement");
  });

  it("marks a Cosmo OS transfer as Cosmetics and a finance file as File import", () => {
    expect(saleBusinessLabel("vault_supplement_import")).toBe("Cosmetics");
    expect(saleBusinessLabel("vault_supplement_import", "vsupp-direct-1")).toBe("Cosmetics");
    expect(saleBusinessLabel("vault_supplement_import", "vsupp-171000")).toBe("File import");
    expect(saleBusinessLabel("vault_file_import")).toBe("File import");
    expect(saleBusinessLabel(undefined)).toBe("Supplement");
    expect(normalizePurchaseOrigin("vault_supplement_import", "vsupp-171000")).toBe("vault_file_import");
  });

  it("labels a finance-file batch as File import", () => {
    const row = mapAdaptToInvoiceRow({
      ...base,
      origin: "vault_supplement_import",
      importBatchId: "vsupp-171000",
      financialStatus: "paid",
    });
    expect(row.origin).toBe("vault_file_import");
    expect(row.secondaryLabel).toBe("File import");
    expect(saleBusinessLabel(row.origin)).toBe("File import");
    expect(row.status).toBe("paid");
  });
});

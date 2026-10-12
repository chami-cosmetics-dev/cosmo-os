import { describe, expect, it } from "vitest";

import { mapAdaptToInvoiceRow } from "@/lib/customer-insight/invoices";

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
  });
});

import { describe, expect, it } from "vitest";

import {
  classifyErpReturnSiMismatch,
  isVaultOrderActiveForReturnSync,
} from "@/lib/find-erp-return-si-mismatches";

describe("find-erp-return-si-mismatches", () => {
  it("detects alternate ERP flow: return SI exists, original not credit-noted, OS active", () => {
    expect(
      classifyErpReturnSiMismatch({
        originalStatus: "Overdue",
        originalDocstatus: 1,
        returnInvoices: [{ name: "SV100-0255", docstatus: 1 }],
        vaultOrder: {
          financialStatus: "paid",
          fulfillmentStage: "invoice_complete",
        },
      }),
    ).toBe("return_si_original_not_credit_noted_os_active");
  });

  it("detects OS not voided when original already credit-noted in ERP", () => {
    expect(
      classifyErpReturnSiMismatch({
        originalStatus: "Credit Note Issued",
        originalDocstatus: 1,
        returnInvoices: [{ name: "SV100-0255", docstatus: 1 }],
        vaultOrder: {
          financialStatus: "paid",
          fulfillmentStage: "dispatched",
        },
      }),
    ).toBe("return_si_exists_os_active");
  });

  it("returns null when OS already voided/returned", () => {
    expect(
      classifyErpReturnSiMismatch({
        originalStatus: "Overdue",
        originalDocstatus: 1,
        returnInvoices: [{ name: "SV100-0255", docstatus: 1 }],
        vaultOrder: {
          financialStatus: "voided",
          fulfillmentStage: "returned",
        },
      }),
    ).toBeNull();
    expect(isVaultOrderActiveForReturnSync(null)).toBe(false);
  });
});

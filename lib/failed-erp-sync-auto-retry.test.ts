import { describe, expect, it } from "vitest";

import { isAwaitingFinancePaymentApprovalError } from "@/lib/failed-erp-sync-auto-retry";

describe("isAwaitingFinancePaymentApprovalError", () => {
  it("detects finance approval wait messages", () => {
    expect(
      isAwaitingFinancePaymentApprovalError(
        "This order is awaiting finance approval. The ERP invoice will be created automatically once approved."
      )
    ).toBe(true);
    expect(isAwaitingFinancePaymentApprovalError("Pending approval from finance")).toBe(true);
  });

  it("rejects unrelated ERP errors", () => {
    expect(isAwaitingFinancePaymentApprovalError("Item code ABC not found")).toBe(false);
    expect(isAwaitingFinancePaymentApprovalError("Network timeout")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  isReplacementCancel,
  isVoidedFinancialStatus,
  smsCancelMatchesDayPriorPlaced,
  smsCancelMatchesMtdInRange,
  smsCancelMatchesMtdPriorMonth,
} from "@/lib/daily-sales-sms-cancels";

describe("SMS cancel classification", () => {
  it("treats voided as cancel and skips replacements", () => {
    expect(isVoidedFinancialStatus("voided")).toBe(true);
    expect(isVoidedFinancialStatus("paid")).toBe(false);
    expect(isReplacementCancel({ replacedByOrderId: "ord_2", cancelKind: "customer_cancel" })).toBe(
      true,
    );
    expect(isReplacementCancel({ replacedByOrderId: null, cancelKind: "replacement" })).toBe(true);
    expect(isReplacementCancel({ replacedByOrderId: null, cancelKind: "customer_cancel" })).toBe(
      false,
    );
  });

  it("puts earlier-placed same-cancel-day in the day-prior bucket", () => {
    expect(smsCancelMatchesDayPriorPlaced("2026-10-25", "2026-10-26", "2026-10-26")).toBe(true);
    expect(smsCancelMatchesDayPriorPlaced("2026-10-26", "2026-10-26", "2026-10-26")).toBe(false);
  });

  it("splits MTD prior-month vs placed-in-month cancels", () => {
    expect(
      smsCancelMatchesMtdPriorMonth("2026-09-28", "2026-10-09", "2026-10-01", "2026-10-26"),
    ).toBe(true);
    expect(
      smsCancelMatchesMtdPriorMonth("2026-10-02", "2026-10-09", "2026-10-01", "2026-10-26"),
    ).toBe(false);
    expect(
      smsCancelMatchesMtdInRange("2026-10-02", "2026-10-09", "2026-10-01", "2026-10-26"),
    ).toBe(true);
    expect(
      smsCancelMatchesMtdInRange("2026-10-26", "2026-10-26", "2026-10-01", "2026-10-26"),
    ).toBe(true);
    expect(
      smsCancelMatchesMtdInRange("2026-09-28", "2026-10-09", "2026-10-01", "2026-10-26"),
    ).toBe(false);
  });
});

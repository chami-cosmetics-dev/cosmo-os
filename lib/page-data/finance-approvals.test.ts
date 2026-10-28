import { describe, expect, it } from "vitest";

import {
  FINANCE_APPROVALS_HISTORY_LIMIT,
  financeApprovalLikePattern,
  mergeFinanceApprovalSlices,
  mergeHistorySearchRows,
} from "@/lib/page-data/finance-approvals-slices";

describe("finance approval history slices", () => {
  it("keeps a 50-row history cap for the default list", () => {
    expect(FINANCE_APPROVALS_HISTORY_LIMIT).toBe(50);
  });

  it("keeps history next to a large pending queue", () => {
    const pending = Array.from({ length: 250 }, (_, i) => ({
      id: `p${i}`,
      status: "pending",
    }));
    const history = [
      { id: "h1", status: "approved" },
      { id: "h2", status: "rejected" },
    ];
    const merged = mergeFinanceApprovalSlices(pending, history);
    expect(merged.filter((row) => row.status !== "pending")).toEqual(history);
  });

  it("builds a contains pattern for order-number search", () => {
    expect(financeApprovalLikePattern("  60020348  ")).toBe("%60020348%");
    expect(financeApprovalLikePattern("%600%")).toBe("%600%");
    expect(financeApprovalLikePattern("   ")).toBeNull();
  });

  it("puts older search hits ahead of the recent 50", () => {
    const recent = [
      { id: "r1", invoiceNo: "60020900" },
      { id: "hit", invoiceNo: "60020348" },
    ];
    const searchHits = [{ id: "old", invoiceNo: "60020348" }];
    expect(mergeHistorySearchRows(recent, searchHits).map((row) => row.id)).toEqual([
      "old",
      "r1",
      "hit",
    ]);
  });
});

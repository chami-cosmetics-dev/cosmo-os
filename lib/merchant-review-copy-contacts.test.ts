import { describe, expect, it } from "vitest";

import {
  buildCopyContactBatch,
  formatCopyContactToastSummary,
  type CopyContactQueueRow,
} from "@/lib/merchant-review-copy-contacts";

function row(
  partial: Partial<CopyContactQueueRow> & Pick<CopyContactQueueRow, "orderId" | "reviewStatus">
): CopyContactQueueRow {
  return {
    customerPhone: partial.customerPhone ?? null,
    orderId: partial.orderId,
    reviewStatus: partial.reviewStatus,
  };
}

describe("buildCopyContactBatch", () => {
  it("builds one phone per line for pending orders with phones", () => {
    const batch = buildCopyContactBatch([
      row({ orderId: "a", reviewStatus: "pending", customerPhone: "0776290291" }),
      row({ orderId: "b", reviewStatus: "pending", customerPhone: " 0712345678 " }),
    ]);

    expect(batch.clipboardText).toBe("0776290291\n0712345678");
    expect(batch.clipboardPhones).toEqual(["0776290291", "0712345678"]);
    expect(batch.markOrderIds).toEqual(["a", "b"]);
    expect(batch.skips).toEqual({ missingPhone: 0, terminalStatus: 0 });
  });

  it("includes already follow_up phones on clipboard but not in markOrderIds", () => {
    const batch = buildCopyContactBatch([
      row({ orderId: "p", reviewStatus: "pending", customerPhone: "0771111111" }),
      row({ orderId: "f", reviewStatus: "follow_up", customerPhone: "0772222222" }),
    ]);

    expect(batch.clipboardPhones).toEqual(["0771111111", "0772222222"]);
    expect(batch.markOrderIds).toEqual(["p"]);
    expect(batch.clipboardOrderIds).toEqual(["p", "f"]);
  });

  it("skips missing phones and does not mark them", () => {
    const batch = buildCopyContactBatch([
      row({ orderId: "a", reviewStatus: "pending", customerPhone: "0776290291" }),
      row({ orderId: "b", reviewStatus: "pending", customerPhone: null }),
      row({ orderId: "c", reviewStatus: "pending", customerPhone: "   " }),
    ]);

    expect(batch.clipboardPhones).toEqual(["0776290291"]);
    expect(batch.markOrderIds).toEqual(["a"]);
    expect(batch.skips.missingPhone).toBe(2);
  });

  it("never includes reviewed or no_response on clipboard or mark lists", () => {
    const batch = buildCopyContactBatch([
      row({ orderId: "r", reviewStatus: "reviewed", customerPhone: "0779999999" }),
      row({ orderId: "n", reviewStatus: "no_response", customerPhone: "0778888888" }),
      row({ orderId: "p", reviewStatus: "pending", customerPhone: "0776290291" }),
    ]);

    expect(batch.clipboardPhones).toEqual(["0776290291"]);
    expect(batch.markOrderIds).toEqual(["p"]);
    expect(batch.skips.terminalStatus).toBe(2);
  });

  it("returns empty clipboard and no mark ids for empty queue", () => {
    const batch = buildCopyContactBatch([]);
    expect(batch.clipboardText).toBe("");
    expect(batch.clipboardPhones).toEqual([]);
    expect(batch.markOrderIds).toEqual([]);
    expect(batch.skips).toEqual({ missingPhone: 0, terminalStatus: 0 });
  });

  it("returns empty clipboard when all rows lack phones", () => {
    const batch = buildCopyContactBatch([
      row({ orderId: "a", reviewStatus: "pending", customerPhone: null }),
      row({ orderId: "b", reviewStatus: "follow_up", customerPhone: "" }),
    ]);

    expect(batch.clipboardText).toBe("");
    expect(batch.markOrderIds).toEqual([]);
    expect(batch.skips.missingPhone).toBe(2);
  });

  it("summarizes mixed skips", () => {
    const batch = buildCopyContactBatch([
      row({ orderId: "a", reviewStatus: "pending", customerPhone: "0771111111" }),
      row({ orderId: "b", reviewStatus: "pending", customerPhone: null }),
      row({ orderId: "c", reviewStatus: "reviewed", customerPhone: "0772222222" }),
      row({ orderId: "d", reviewStatus: "follow_up", customerPhone: "0773333333" }),
    ]);

    expect(batch.clipboardPhones).toEqual(["0771111111", "0773333333"]);
    expect(batch.markOrderIds).toEqual(["a"]);
    expect(batch.skips).toEqual({ missingPhone: 1, terminalStatus: 1 });
  });

  it("allows duplicate phones across orders (one line per order)", () => {
    const batch = buildCopyContactBatch([
      row({ orderId: "a", reviewStatus: "pending", customerPhone: "0771111111" }),
      row({ orderId: "b", reviewStatus: "pending", customerPhone: "0771111111" }),
    ]);

    expect(batch.clipboardText).toBe("0771111111\n0771111111");
    expect(batch.markOrderIds).toEqual(["a", "b"]);
  });
});

describe("formatCopyContactToastSummary", () => {
  it("includes skip and update counts", () => {
    const message = formatCopyContactToastSummary({
      copied: 5,
      updated: 3,
      alreadyFollowUp: 1,
      skips: { missingPhone: 2, terminalStatus: 1 },
      notFound: 0,
    });

    expect(message).toContain("Copied 5 number(s)");
    expect(message).toContain("marked 3 Follow up");
    expect(message).toContain("1 already Follow up");
    expect(message).toContain("2 skipped (no phone)");
    expect(message).toContain("1 skipped (reviewed/no response)");
  });
});

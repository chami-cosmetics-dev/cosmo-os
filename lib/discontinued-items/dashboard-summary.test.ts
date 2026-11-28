import { describe, expect, it } from "vitest";

import { segmentsOf, summarize, type SummaryInput } from "@/lib/discontinued-items/dashboard-summary";

const base: SummaryInput = {
  stage: "AWAITING_APPROVAL",
  presentIn: "BOTH",
  erp1Done: false,
  erp2Done: false,
  draftClicked: false,
  verification: null,
  madeActiveAgain: false,
  checkFailed: false,
};

const item = (over: Partial<SummaryInput>): SummaryInput => ({ ...base, ...over });

describe("segmentsOf", () => {
  it("purchasing segments from the saved status", () => {
    expect(segmentsOf(item({})).purchasing).toBe("waiting");
    expect(segmentsOf(item({ stage: "PENDING", erp1Done: true })).purchasing).toBe("pending");
    expect(segmentsOf(item({ stage: "SHOPIFY_DRAFT" })).purchasing).toBe("approved");
    expect(segmentsOf(item({ stage: "DONE", presentIn: "ERP2_ONLY" })).purchasing).toBe("notOnWebsite");
    expect(segmentsOf(item({ stage: "DONE", presentIn: "ERP1_ONLY", verification: "PASS" })).purchasing).toBe("approved");
  });

  it("Shopify Draft only for approved items", () => {
    expect(segmentsOf(item({})).shopify).toBeNull();
    expect(segmentsOf(item({ stage: "DONE", presentIn: "ERP2_ONLY" })).shopify).toBeNull();
    expect(segmentsOf(item({ stage: "SHOPIFY_DRAFT" })).shopify).toBe("awaitingDraft");
    // Already Draft in Shopify at approval: its own section, then After Drafting like Completed.
    const already = segmentsOf(
      item({ stage: "DONE", presentIn: "ERP1_ONLY", verification: "PASS", alreadyDrafted: true }),
    );
    expect(already.shopify).toBe("alreadyDraft");
    expect(already.after).toBe("stillDrafted");
    expect(segmentsOf(item({ stage: "SHOPIFY_DRAFT", draftClicked: true })).shopify).toBe("awaitingCheck");
    expect(segmentsOf(item({ stage: "SHOPIFY_DRAFT", verification: "FAIL" })).shopify).toBe("mismatch");
    // Re-drafted after a mismatch: waiting for the new check, not still a mismatch.
    expect(segmentsOf(item({ stage: "SHOPIFY_DRAFT", verification: "FAIL", draftClicked: true })).shopify).toBe(
      "awaitingCheck",
    );
    expect(segmentsOf(item({ stage: "DONE", verification: "PASS" })).shopify).toBe("completed");
  });

  it("After Drafting only for completed items", () => {
    expect(segmentsOf(item({ stage: "SHOPIFY_DRAFT" })).after).toBeNull();
    expect(segmentsOf(item({ stage: "DONE", verification: "PASS" })).after).toBe("stillDrafted");
    expect(segmentsOf(item({ stage: "DONE", verification: "PASS", madeActiveAgain: true })).after).toBe("activeAgain");
  });
});

describe("summarize", () => {
  const items: SummaryInput[] = [
    item({}),
    item({ stage: "PENDING", erp1Done: true }),
    item({ stage: "PENDING", erp2Done: true }),
    item({ stage: "PENDING", erp2Done: true }),
    item({ stage: "DONE", presentIn: "ERP2_ONLY", erp2Done: true }),
    item({ stage: "SHOPIFY_DRAFT" }),
    item({ stage: "SHOPIFY_DRAFT", draftClicked: true, checkFailed: true }),
    item({ stage: "SHOPIFY_DRAFT", verification: "FAIL" }),
    item({ stage: "DONE", verification: "PASS" }),
    item({ stage: "DONE", verification: "PASS", madeActiveAgain: true }),
    item({ stage: "DONE", verification: "PASS", alreadyDrafted: true }),
  ];
  const s = summarize(items);
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

  it("each item counted once per doughnut, doughnuts chain", () => {
    expect(sum(s.purchasing)).toBe(items.length);
    expect(sum(s.shopify)).toBe(s.purchasing.approved);
    expect(sum(s.after)).toBe(s.shopify.completed + s.shopify.alreadyDraft);
  });

  it("counts and splits", () => {
    expect(s.purchasing).toEqual({ waiting: 1, pending: 3, approved: 6, notOnWebsite: 1 });
    expect([s.pendingErp1Left, s.pendingErp2Left]).toEqual([2, 1]);
    expect(s.shopify).toEqual({ awaitingDraft: 1, alreadyDraft: 1, awaitingCheck: 1, mismatch: 1, completed: 2 });
    expect(s.checkFailed).toBe(1);
    expect(s.after).toEqual({ stillDrafted: 2, activeAgain: 1 });
  });
});

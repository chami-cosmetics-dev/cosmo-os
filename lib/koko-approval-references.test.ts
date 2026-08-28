import { describe, expect, it } from "vitest";

import {
  parseKokoApprovalPayload,
  validateKokoReferenceAmountTotal,
} from "@/lib/koko-approval-references";

describe("validateKokoReferenceAmountTotal", () => {
  it("accepts matching totals within one cent", () => {
    expect(
      validateKokoReferenceAmountTotal(
        [{ amount: 5000 }, { amount: 4950.01 }],
        9950.01,
      ),
    ).toBeNull();
  });

  it("rejects mismatched totals", () => {
    expect(
      validateKokoReferenceAmountTotal([{ amount: 5000 }, { amount: 4000 }], 9950),
    ).toMatch(/must total Rs 9950.00/);
  });
});

describe("parseKokoApprovalPayload", () => {
  it("parses single KOKO reference using full target amount", () => {
    const result = parseKokoApprovalPayload({
      kokoReference: "order#10502020",
      targetAmount: 9950,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.multipleKokoPayments).toBe(false);
    expect(result.value.entries).toEqual([
      {
        reference: "order#10502020",
        normalized: "ORDER#10502020",
        amount: 9950,
      },
    ]);
  });

  it("requires two or more references in multiple mode", () => {
    const result = parseKokoApprovalPayload({
      multipleKokoPayments: true,
      kokoReferences: [{ reference: "A", amount: 100 }],
      targetAmount: 100,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("KOKO_REFERENCES_REQUIRED");
  });

  it("validates per-payment amounts in multiple mode", () => {
    const result = parseKokoApprovalPayload({
      multipleKokoPayments: true,
      kokoReferences: [
        { reference: "KOKO-1", amount: 5000 },
        { reference: "KOKO-2", amount: 4950 },
      ],
      targetAmount: 9950,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entries).toHaveLength(2);
    expect(result.value.primaryReference).toBe("KOKO-1");
  });
});

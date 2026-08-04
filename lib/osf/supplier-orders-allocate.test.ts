import { describe, expect, it } from "vitest";

import type { WorkingOrderRow } from "@/lib/osf/supplier-orders-draft";
import {
  isRowOverAllocated,
  rowAllocatedSum,
  validateDraftForGenerate,
} from "@/lib/osf/supplier-orders-allocate";

function row(
  partial: Partial<WorkingOrderRow> & Pick<WorkingOrderRow, "sku">,
): WorkingOrderRow {
  return {
    description: "Test item",
    reorderQty: 10,
    allocations: [],
    ...partial,
  };
}

describe("rowAllocatedSum", () => {
  it("ignores zero and negative qtys", () => {
    const sum = rowAllocatedSum(
      row({
        sku: "A_1",
        allocations: [
          { supplierName: "S1", qty: 0 },
          { supplierName: "S2", qty: -1 },
          { supplierName: "S3", qty: 3 },
          { supplierName: "S4", qty: 2 },
        ],
      }),
    );
    expect(sum).toBe(5);
  });
});

describe("isRowOverAllocated", () => {
  it("allows under-allocation when reorderQty > 0", () => {
    expect(
      isRowOverAllocated(
        row({
          sku: "A_1",
          reorderQty: 10,
          allocations: [{ supplierName: "S1", qty: 4 }],
        }),
      ),
    ).toBe(false);
  });

  it("blocks over-allocation when reorderQty > 0", () => {
    expect(
      isRowOverAllocated(
        row({
          sku: "A_1",
          reorderQty: 10,
          allocations: [
            { supplierName: "S1", qty: 6 },
            { supplierName: "S2", qty: 5 },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("does not treat reorderQty 0 as over-allocated", () => {
    expect(
      isRowOverAllocated(
        row({
          sku: "A_1",
          reorderQty: 0,
          allocations: [{ supplierName: "S1", qty: 100 }],
        }),
      ),
    ).toBe(false);
  });
});

describe("validateDraftForGenerate", () => {
  it("passes under-allocation", () => {
    expect(
      validateDraftForGenerate([
        row({
          sku: "A_1",
          reorderQty: 20,
          allocations: [{ supplierName: "S1", qty: 5 }],
        }),
      ]),
    ).toEqual({ ok: true });
  });

  it("blocks over-allocation and returns skus", () => {
    const result = validateDraftForGenerate([
      row({
        sku: "A_1",
        reorderQty: 10,
        allocations: [{ supplierName: "S1", qty: 11 }],
      }),
      row({
        sku: "B_1",
        reorderQty: 5,
        allocations: [{ supplierName: "S2", qty: 3 }],
      }),
    ]);
    expect(result).toEqual({
      ok: false,
      error: "One or more rows are over-allocated",
      skus: ["A_1"],
    });
  });

  it("skips empty/zero allocations when checking positives", () => {
    expect(
      validateDraftForGenerate([
        row({
          sku: "A_1",
          reorderQty: 10,
          allocations: [
            { supplierName: "S1", qty: 0 },
            { supplierName: "S2", qty: 2 },
          ],
        }),
      ]),
    ).toEqual({ ok: true });
  });

  it("fails when no positive allocations exist", () => {
    expect(
      validateDraftForGenerate([
        row({
          sku: "A_1",
          reorderQty: 10,
          allocations: [{ supplierName: "S1", qty: 0 }],
        }),
        row({
          sku: "B_1",
          reorderQty: 5,
          allocations: [],
        }),
      ]),
    ).toEqual({
      ok: false,
      error: "At least one allocation with quantity greater than zero is required",
    });
  });
});

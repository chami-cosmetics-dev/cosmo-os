import { describe, expect, it } from "vitest";

import {
  buildDraftStorageKey,
  DRAFT_KEY,
  DRAFT_VERSION,
  normalizeDraft,
  type SupplierOrdersDraft,
} from "@/lib/osf/supplier-orders-draft";

function draft(partial: Partial<SupplierOrdersDraft> & Pick<SupplierOrdersDraft, "rows">): SupplierOrdersDraft {
  return {
    version: DRAFT_VERSION,
    companyId: "company-1",
    userId: "user-1",
    updatedAt: "2026-08-04T12:00:00.000Z",
    ...partial,
  };
}

describe("buildDraftStorageKey", () => {
  it("scopes localStorage key by company and user", () => {
    expect(buildDraftStorageKey("co_abc", "usr_xyz")).toBe(
      `${DRAFT_KEY}:co_abc:usr_xyz`,
    );
  });
});

describe("normalizeDraft", () => {
  it("dedupes rows by SKU keeping the first occurrence", () => {
    const normalized = normalizeDraft(
      draft({
        rows: [
          {
            sku: "ABC_1",
            description: "First",
            reorderQty: 10,
            allocations: [{ supplierName: "S1", qty: 1 }],
          },
          {
            sku: "ABC_1",
            description: "Duplicate",
            reorderQty: 99,
            allocations: [{ supplierName: "S2", qty: 5 }],
          },
          {
            sku: "DEF_1",
            description: "Other",
            reorderQty: 3,
            allocations: [],
          },
        ],
      }),
    );

    expect(normalized.rows).toHaveLength(2);
    expect(normalized.rows[0]).toMatchObject({
      sku: "ABC_1",
      description: "First",
      reorderQty: 10,
    });
    expect(normalized.rows[1]?.sku).toBe("DEF_1");
  });

  it("clamps negative reorder and allocation qty to zero", () => {
    const normalized = normalizeDraft(
      draft({
        rows: [
          {
            sku: "ABC_1",
            description: "Item",
            reorderQty: -5,
            allocations: [{ supplierName: "S1", qty: -2 }],
          },
        ],
      }),
    );

    expect(normalized.rows[0]?.reorderQty).toBe(0);
    expect(normalized.rows[0]?.allocations[0]?.qty).toBe(0);
  });

  it("round-trips through JSON serialize preserving shape", () => {
    const source = draft({
      companyId: "co_1",
      userId: "usr_1",
      rows: [
        {
          sku: "SKU_1",
          description: "Widget",
          reorderQty: 12,
          allocations: [
            { supplierId: "sup_1", supplierName: "Supplier A", qty: 4 },
            { supplierName: "Supplier B", qty: 0 },
          ],
        },
      ],
    });

    const normalized = normalizeDraft(source);
    const roundTrip = normalizeDraft(JSON.parse(JSON.stringify(normalized)) as SupplierOrdersDraft);

    expect(roundTrip).toEqual(normalized);
    expect(roundTrip.version).toBe(DRAFT_VERSION);
  });
});

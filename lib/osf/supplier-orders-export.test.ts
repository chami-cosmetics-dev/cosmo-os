import { describe, expect, it } from "vitest";

import { groupLinesBySupplier } from "@/lib/osf/supplier-orders-export";
import type { WorkingOrderRow } from "@/lib/osf/supplier-orders-draft";

describe("groupLinesBySupplier", () => {
  it("groups positive allocations and skips zero qty", () => {
    const rows: WorkingOrderRow[] = [
      {
        sku: "A_1",
        description: "Item A",
        reorderQty: 20,
        allocations: [
          { supplierId: "s1", supplierName: "Sup One", qty: 5 },
          { supplierId: "s2", supplierName: "Sup Two", qty: 10 },
          { supplierId: "s3", supplierName: "Sup Three", qty: 0 },
        ],
      },
      {
        sku: "B_1",
        description: "Item B",
        reorderQty: 5,
        allocations: [{ supplierId: "s1", supplierName: "Sup One", qty: 2 }],
      },
    ];

    const grouped = groupLinesBySupplier(rows);
    expect(grouped.size).toBe(2);
    expect(grouped.get("s1")?.lines).toEqual([
      { sku: "A_1", description: "Item A", orderQty: 5 },
      { sku: "B_1", description: "Item B", orderQty: 2 },
    ]);
    expect(grouped.get("s2")?.lines).toEqual([
      { sku: "A_1", description: "Item A", orderQty: 10 },
    ]);
  });
});

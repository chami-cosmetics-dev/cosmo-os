import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    productItem: { findMany: vi.fn() },
    supplier: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/osf/supplier-orders-reorder", () => ({
  computeTotalOrderQtyForSkus: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { computeTotalOrderQtyForSkus } from "@/lib/osf/supplier-orders-reorder";
import {
  buildOsfPortalPushPayload,
  COSMO_OSF_CONTRACT_VERSION,
  SupplierPortalPushError,
} from "@/lib/osf/supplier-orders-portal-push";

describe("buildOsfPortalPushPayload (Phase G)", () => {
  beforeEach(() => {
    vi.mocked(computeTotalOrderQtyForSkus).mockReset();
    vi.mocked(prisma.productItem.findMany).mockReset();
    vi.mocked(prisma.supplier.findMany).mockReset();
  });

  it("builds cosmo-osf-push.v1 with server TOTAL ORDER QTY and requestSuggestions", async () => {
    vi.mocked(computeTotalOrderQtyForSkus).mockResolvedValue(
      new Map([
        ["SKU-1", 12],
        ["SKU-2", 5],
      ]),
    );
    vi.mocked(prisma.productItem.findMany).mockResolvedValue([
      {
        sku: "SKU-1",
        productTitle: "Serum",
        barcode: "111",
        vendorId: "vend_a",
        erp1ProductPriority: "A",
        erp2ProductPriority: null,
        vendor: { id: "vend_a", name: "Brand A" },
      },
      {
        sku: "SKU-2",
        productTitle: "Cream",
        barcode: null,
        vendorId: "vend_b",
        erp1ProductPriority: null,
        erp2ProductPriority: "B",
        vendor: { id: "vend_b", name: "Brand B" },
      },
    ] as never);
    vi.mocked(prisma.supplier.findMany).mockResolvedValue([
      { id: "sup_1", code: "S1", name: "Supplier One" },
      { id: "sup_2", code: "S2", name: "Supplier Two" },
    ] as never);

    const built = await buildOsfPortalPushPayload({
      companyId: "co_1",
      actorUserId: "user_1",
      actorEmail: "staff@example.com",
      brandFilterVendorId: "vend_a",
      priorityFilter: "A",
      idempotencyKey: "idem-key-phase-g-test-001",
      rows: [
        {
          sku: "SKU-1",
          description: "ignored client desc",
          reorderQty: 99,
          allocations: [
            { supplierId: "sup_1", supplierName: "Supplier One", qty: 7 },
            { supplierId: "sup_2", supplierName: "Supplier Two", qty: 3 },
          ],
        },
        {
          sku: "SKU-2",
          description: "Cream client",
          reorderQty: 5,
          allocations: [
            { supplierId: "sup_2", supplierName: "Supplier Two", qty: 5 },
          ],
        },
      ],
    });

    expect(built.idempotencyKey).toBe("idem-key-phase-g-test-001");
    expect(built.payload.contractVersion).toBe(COSMO_OSF_CONTRACT_VERSION);
    expect(built.payload.source.cosmoCompanyId).toBe("co_1");
    expect(built.payload.selection.mode).toBe("SUPPLIER_ORDERS_SELECTION");
    expect(built.payload.selection.brandFilter).toEqual({
      cosmoVendorId: "vend_a",
    });
    expect(built.payload.items).toEqual([
      {
        lineKey: "SKU-1",
        sku: "SKU-1",
        description: "Serum",
        barcode: "111",
        brand: { cosmoVendorId: "vend_a", name: "Brand A" },
        priorities: { erp1: "A", erp2: null },
        quantity: { totalOrderQty: 12 },
      },
      {
        lineKey: "SKU-2",
        sku: "SKU-2",
        description: "Cream",
        barcode: undefined,
        brand: { cosmoVendorId: "vend_b", name: "Brand B" },
        priorities: { erp1: null, erp2: "B" },
        quantity: { totalOrderQty: 5 },
      },
    ]);
    expect(built.payload.requestSuggestions).toEqual([
      {
        lineKey: "SKU-1",
        cosmoSupplierId: "sup_1",
        cosmoSupplierCode: "S1",
        cosmoSupplierName: "Supplier One",
        suggestedRequestQty: 7,
      },
      {
        lineKey: "SKU-1",
        cosmoSupplierId: "sup_2",
        cosmoSupplierCode: "S2",
        cosmoSupplierName: "Supplier Two",
        suggestedRequestQty: 3,
      },
      {
        lineKey: "SKU-2",
        cosmoSupplierId: "sup_2",
        cosmoSupplierCode: "S2",
        cosmoSupplierName: "Supplier Two",
        suggestedRequestQty: 5,
      },
    ]);
    // Client reorderQty must never override server TOTAL ORDER QTY.
    expect(built.payload.items[0]?.quantity.totalOrderQty).toBe(12);
  });

  it("omits zero-qty allocations and rejects missing brand/vendor", async () => {
    vi.mocked(computeTotalOrderQtyForSkus).mockResolvedValue(
      new Map([["SKU-X", 1]]),
    );
    vi.mocked(prisma.productItem.findMany).mockResolvedValue([
      {
        sku: "SKU-X",
        productTitle: "X",
        barcode: null,
        vendorId: null,
        erp1ProductPriority: null,
        erp2ProductPriority: null,
        vendor: null,
      },
    ] as never);
    vi.mocked(prisma.supplier.findMany).mockResolvedValue([]);

    await expect(
      buildOsfPortalPushPayload({
        companyId: "co_1",
        actorUserId: "user_1",
        rows: [
          {
            sku: "SKU-X",
            description: "X",
            reorderQty: 1,
            allocations: [
              { supplierId: "sup_1", supplierName: "S", qty: 0 },
              { supplierId: "sup_1", supplierName: "S", qty: 1 },
            ],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(SupplierPortalPushError);
  });
});

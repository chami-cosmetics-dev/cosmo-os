import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    productItem: { findMany: vi.fn() },
    supplier: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/osf/supplier-orders-reorder", () => ({
  computeSupplierOrderSnapshot: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { computeSupplierOrderSnapshot } from "@/lib/osf/supplier-orders-reorder";
import {
  buildOsfPortalPushPayload,
  prepareOsfPortalPush,
  pushPreparedOsfToSupplierPortal,
  COSMO_OSF_CONTRACT_VERSION,
  SupplierPortalPushError,
} from "@/lib/osf/supplier-orders-portal-push";

const sourceColumns = [{ columnKey: "primary", erpInstanceId: "erp-1", itemCode: "SKU-1", warehouses: ["Main"] }];
const snapshot = { totalStock: "2.749", totalRop: "10", columns: sourceColumns };

function computed(rows: [string, number][]) {
  return {
    asOfDate: "2026-11-23",
    totalOrderQty: new Map(rows),
    snapshots: new Map([["SKU-1", snapshot]]),
  };
}

describe("buildOsfPortalPushPayload (Phase G)", () => {
  beforeEach(() => {
    vi.mocked(computeSupplierOrderSnapshot).mockReset();
    vi.mocked(prisma.productItem.findMany).mockReset();
    vi.mocked(prisma.supplier.findMany).mockReset();
  });

  it("builds cosmo-osf-push.v1 with server TOTAL ORDER QTY and requestSuggestions", async () => {
    vi.mocked(computeSupplierOrderSnapshot).mockResolvedValue(
      computed([
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
    expect(built.payload.source).toMatchObject({ cosmoCompanyId: "co_1", asOfDate: "2026-11-23", osfVariant: "main" });
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
        snapshot,
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
    vi.mocked(computeSupplierOrderSnapshot).mockResolvedValue(
      computed([["SKU-X", 1]]),
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

describe("prepared OSF transfer", () => {
  const actor = { companyId: "company-a", actorUserId: "user-a" };
  const token = "synthetic_portal_secret";
  const draft = {
    ...actor,
    actorEmail: "synthetic@example.test",
    rows: [{ sku: "SKU-1", description: "Synthetic", reorderQty: 12, allocations: [] }],
  };

  beforeEach(() => {
    vi.stubEnv("SUPPLIER_PORTAL_BASE_URL", "https://portal.example.test");
    vi.stubEnv("SUPPLIER_PORTAL_INTEGRATION_TOKEN", token);
    vi.setSystemTime(new Date("2026-11-21T00:00:00Z"));
    vi.mocked(computeSupplierOrderSnapshot).mockResolvedValue(computed([["SKU-1", 12]]));
    vi.mocked(prisma.productItem.findMany).mockResolvedValue([{
      sku: "SKU-1", productTitle: "Synthetic", barcode: null, vendorId: "brand",
      erp1ProductPriority: null, erp2ProductPriority: null,
      vendor: { id: "brand", name: "Synthetic Brand" },
    }] as never);
    vi.mocked(prisma.supplier.findMany).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("replays the original import after the response is lost, then gives a changed payload a new key", async () => {
    const imports = new Map<string, { body: string; importId: string }>();
    const transport = vi.fn<typeof fetch>(async (_url, options) => {
      const headers = new Headers(options?.headers);
      expect(headers.get("Authorization")).toBe("Bearer " + token);
      const key = headers.get("Idempotency-Key")!;
      const body = String(options?.body);
      const prior = imports.get(key);
      if (prior) {
        if (prior.body !== body) return Response.json({ error: "IDEMPOTENCY_CONFLICT" }, { status: 409 });
        return Response.json({ importId: prior.importId, replay: true });
      }
      const importId = "import-" + (imports.size + 1);
      imports.set(key, { body, importId });
      if (imports.size === 1) throw new Error("Response lost after commit");
      return Response.json({ importId, replay: false }, { status: 201 });
    });
    vi.stubGlobal("fetch", transport);
    const ticket = await prepareOsfPortalPush(draft);
    const serialized = Buffer.from(ticket, "base64url");
    expect(serialized.includes(token)).toBe(false);
    expect(serialized.includes(draft.actorEmail)).toBe(false);
    expect(transport).not.toHaveBeenCalled();

    await expect(pushPreparedOsfToSupplierPortal(ticket, actor)).rejects.toMatchObject({ status: 502 });
    vi.setSystemTime(new Date("2026-11-21T00:01:00Z"));
    vi.mocked(computeSupplierOrderSnapshot).mockResolvedValue(computed([["SKU-1", 25]]));
    const restoredTicket = JSON.parse(JSON.stringify(ticket)) as string;
    await expect(pushPreparedOsfToSupplierPortal(restoredTicket, actor)).resolves.toMatchObject({
      importId: "import-1", replay: true,
    });
    expect(transport.mock.calls[0][1]?.body).toBe(transport.mock.calls[1][1]?.body);
    expect(imports.size).toBe(1);

    const changedTicket = await prepareOsfPortalPush(draft);
    await expect(pushPreparedOsfToSupplierPortal(changedTicket, actor)).resolves.toMatchObject({
      importId: "import-2", replay: false,
    });
    expect([...imports.values()].map(({ body }) => JSON.parse(body).items[0].quantity.totalOrderQty)).toEqual([12, 25]);
  });

  it("rejects a tampered, expired, cross-company or cross-user ticket before calling Portal", async () => {
    const transport = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", transport);
    const ticket = await prepareOsfPortalPush(draft);
    const bytes = Buffer.from(ticket, "base64url");
    bytes[30] ^= 1;
    await expect(pushPreparedOsfToSupplierPortal(bytes.toString("base64url"), actor)).rejects.toMatchObject({ status: 409 });
    await expect(pushPreparedOsfToSupplierPortal(ticket, { ...actor, companyId: "company-b" })).rejects.toMatchObject({ status: 409 });
    await expect(pushPreparedOsfToSupplierPortal(ticket, { ...actor, actorUserId: "user-b" })).rejects.toMatchObject({ status: 409 });
    vi.stubEnv("SUPPLIER_PORTAL_BASE_URL", "https://other-portal.example.test");
    await expect(pushPreparedOsfToSupplierPortal(ticket, actor)).rejects.toMatchObject({ status: 409 });
    vi.stubEnv("SUPPLIER_PORTAL_BASE_URL", "https://portal.example.test");
    vi.setSystemTime(new Date("2026-11-22T00:01:00Z"));
    await expect(pushPreparedOsfToSupplierPortal(ticket, actor)).rejects.toMatchObject({ status: 409 });
    expect(transport).not.toHaveBeenCalled();
  });
});

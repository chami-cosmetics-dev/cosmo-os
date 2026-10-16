import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  categoryUpsert: vi.fn(),
  companyLocationFindFirst: vi.fn(),
  productItemFindMany: vi.fn(),
  productItemUpdateMany: vi.fn(),
  productItemUpsert: vi.fn(),
  getAllOsfErpInstances: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    category: { upsert: mocks.categoryUpsert },
    companyLocation: { findFirst: mocks.companyLocationFindFirst },
    productItem: {
      findMany: mocks.productItemFindMany,
      updateMany: mocks.productItemUpdateMany,
      upsert: mocks.productItemUpsert,
    },
  },
}));

vi.mock("@/lib/osf/erp-stock", async () => {
  const actual = await vi.importActual<typeof import("@/lib/osf/erp-stock")>("@/lib/osf/erp-stock");
  return {
    ...actual,
    getAllOsfErpInstances: mocks.getAllOsfErpInstances,
  };
});

import { syncErpItemCatalog } from "@/lib/product-items/erp-item-catalog-sync";

const ERP1 = { id: "erp1-id", label: "ERP_1 - Cosmetics", cfg: { baseUrl: "https://erp1.example.com", apiKey: "k1", apiSecret: "s1" } };
const ERP2 = { id: "erp2-id", label: "ERP_2 - Trading", cfg: { baseUrl: "https://erp2.example.com", apiKey: "k2", apiSecret: "s2" } };
const LOCATION = { id: "loc-1", shopifyLocationId: "shopify-loc-1" };

function customFieldResponse() {
  return Response.json({ data: [{ fieldname: "custom_product_priority", label: "Product Priority" }] });
}

function itemListResponse(items: Array<Record<string, unknown>>) {
  return Response.json({ data: items });
}

/** Stub global fetch: Custom Field lookup always resolves; Item list is per-baseUrl. */
function stubFetch(itemsByBaseUrl: Record<string, Array<Record<string, unknown>>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/api/resource/Custom Field") || url.includes("/api/resource/Custom%20Field")) {
        return customFieldResponse();
      }
      if (url.includes("/api/resource/Item")) {
        const base = Object.keys(itemsByBaseUrl).find((b) => url.startsWith(b));
        return itemListResponse(base ? itemsByBaseUrl[base] : []);
      }
      return Response.json({ data: [] });
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.categoryUpsert.mockResolvedValue({ id: "cat-1" });
  mocks.companyLocationFindFirst.mockResolvedValue(LOCATION);
  mocks.productItemFindMany.mockResolvedValue([]);
  mocks.productItemUpdateMany.mockResolvedValue({ count: 1 });
  mocks.productItemUpsert.mockResolvedValue({ id: "pi-1" });
});

describe("syncErpItemCatalog", () => {
  it("creates a new ProductItem for a SKU only present in ERP1", async () => {
    mocks.getAllOsfErpInstances.mockResolvedValue([ERP1]);
    stubFetch({
      "https://erp1.example.com": [
        { item_code: "NEW01", item_name: "New Serum", disabled: 0, barcode: "1234", custom_product_priority: "Newly Added", modified: "2026-09-01 10:00:00" },
      ],
    });

    const result = await syncErpItemCatalog("company-1");

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(mocks.productItemUpsert).toHaveBeenCalledTimes(1);
    const call = mocks.productItemUpsert.mock.calls[0][0];
    expect(call.create.sku).toBe("NEW01");
    expect(call.create.erp1ProductPriority).toBe("Newly Added");
    expect(call.create.erp2ProductPriority).toBeUndefined();
    expect(call.create.itemStatusCategory).toBe("NEWLY_ADDED");
    expect(call.create.shopifyVariantId).toBe("erp-NEW01");
  });

  it("routes the same SKU seen in both ERPs onto one ProductItem with both priority fields", async () => {
    mocks.getAllOsfErpInstances.mockResolvedValue([ERP1, ERP2]);
    stubFetch({
      "https://erp1.example.com": [
        { item_code: "DUAL01", item_name: "Dual Item", disabled: 0, custom_product_priority: "Top Priority", modified: "2026-09-01 10:00:00" },
      ],
      "https://erp2.example.com": [
        { item_code: "dual01", item_name: "Dual Item", disabled: 0, custom_product_priority: "Non Priority", modified: "2026-09-01 10:00:00" },
      ],
    });

    const result = await syncErpItemCatalog("company-1");

    expect(result.created).toBe(1);
    expect(mocks.productItemUpsert).toHaveBeenCalledTimes(1);
    const call = mocks.productItemUpsert.mock.calls[0][0];
    expect(call.create.erp1ProductPriority).toBe("Top Priority");
    expect(call.create.erp2ProductPriority).toBe("Non Priority");
  });

  it("updates priority fields only on an existing ProductItem, never re-creating it", async () => {
    mocks.getAllOsfErpInstances.mockResolvedValue([ERP1]);
    mocks.productItemFindMany.mockResolvedValue([{ id: "pi-existing", barcode: null }]);
    stubFetch({
      "https://erp1.example.com": [
        { item_code: "EXIST01", item_name: "Existing Item", disabled: 0, barcode: "999", custom_product_priority: "Top Priority", modified: "2026-09-01 10:00:00" },
      ],
    });

    const result = await syncErpItemCatalog("company-1");

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    expect(mocks.productItemUpsert).not.toHaveBeenCalled();
    expect(mocks.productItemUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["pi-existing"] } },
      data: expect.objectContaining({ erp1ProductPriority: "Top Priority" }),
    });
    // barcode was empty on the existing row, so a fill-in update fires too.
    expect(mocks.productItemUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["pi-existing"] } },
      data: { barcode: "999" },
    });
  });

  it("excludes a disabled Item entirely — no create, no update", async () => {
    mocks.getAllOsfErpInstances.mockResolvedValue([ERP1]);
    stubFetch({
      "https://erp1.example.com": [
        { item_code: "OFF01", item_name: "Discontinued", disabled: 1, custom_product_priority: "Top Priority", modified: "2026-09-01 10:00:00" },
      ],
    });

    const result = await syncErpItemCatalog("company-1");

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mocks.productItemUpsert).not.toHaveBeenCalled();
    expect(mocks.productItemUpdateMany).not.toHaveBeenCalled();
  });

  it("is idempotent: re-running against the now-existing row updates instead of duplicating", async () => {
    mocks.getAllOsfErpInstances.mockResolvedValue([ERP1]);
    stubFetch({
      "https://erp1.example.com": [
        { item_code: "IDEMP01", item_name: "Idempotent Item", disabled: 0, custom_product_priority: "Newly Added", modified: "2026-09-01 10:00:00" },
      ],
    });

    const first = await syncErpItemCatalog("company-1");
    expect(first.created).toBe(1);

    // Simulate the row now existing for the second run.
    mocks.productItemFindMany.mockResolvedValue([{ id: "pi-1", barcode: null }]);

    const second = await syncErpItemCatalog("company-1");
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(mocks.productItemUpsert).toHaveBeenCalledTimes(1); // only from the first run
  });

  it("skips creating when no CompanyLocation is mapped to the ERP instance, and reports it", async () => {
    mocks.getAllOsfErpInstances.mockResolvedValue([ERP1]);
    mocks.companyLocationFindFirst.mockResolvedValue(null);
    stubFetch({
      "https://erp1.example.com": [
        { item_code: "NOLOC01", item_name: "No Location Item", disabled: 0, custom_product_priority: "Newly Added", modified: "2026-09-01 10:00:00" },
      ],
    });

    const result = await syncErpItemCatalog("company-1");

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toMatch(/no CompanyLocation mapped/i);
  });
});

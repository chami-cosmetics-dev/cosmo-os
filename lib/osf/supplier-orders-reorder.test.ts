import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { productOsfRop: { findMany: vi.fn() } } }));
vi.mock("@/lib/osf/column-config", () => ({ resolveOsfColumns: vi.fn() }));
vi.mock("@/lib/osf/erp-stock", async (load) => ({
  ...await load<typeof import("@/lib/osf/erp-stock")>(),
  fetchBinActualQty: vi.fn(),
  getAllOsfErpInstances: vi.fn(),
}));

import { resolveOsfColumns, type OsfResolvedColumn } from "@/lib/osf/column-config";
import { fetchBinActualQty, getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { computeSupplierOrderSnapshot } from "@/lib/osf/supplier-orders-reorder";
import { prisma } from "@/lib/prisma";

const column = (key: string, erpnextInstanceId: string): OsfResolvedColumn => ({
  id: key, key, label: key, erpnextInstanceId, companyLocationId: null, companyLocationName: null,
  warehouses: ["Main"], directWarehouses: [], includeInStock: true, includeInRop: true,
  allocationPriority: 1, sortOrder: 1, active: true,
});

function fixtures(columns: OsfResolvedColumn[], quantities: Record<string, string>) {
  vi.mocked(resolveOsfColumns).mockResolvedValue(columns);
  vi.mocked(prisma.productOsfRop.findMany).mockResolvedValue([
    { sku: "A", columnKey: "east", ropQty: 5 },
    { sku: "A", columnKey: "west", ropQty: 5 },
    { sku: "ZERO", columnKey: "east", ropQty: 0 },
    { sku: "ZERO", columnKey: "west", ropQty: 0 },
  ] as never);
  vi.mocked(getAllOsfErpInstances).mockResolvedValue(["one", "two"].map(id => ({
    id, label: id, cfg: { baseUrl: id, apiKey: "test", apiSecret: "test" },
  })));
  vi.mocked(fetchBinActualQty).mockImplementation(async ({cfg, observedBins}) => {
    if (cfg.baseUrl in quantities) observedBins?.set(JSON.stringify(["Main", "A"]), quantities[cfg.baseUrl]);
    observedBins?.set(JSON.stringify(["Main", "ZERO"]), "0");
    const stock = quantities[cfg.baseUrl];
    return stock === undefined ? new Map() : new Map([["Main::A", Number(stock)]]);
  });
}

describe("supplier-order coverage snapshot", () => {
  it("keeps equal warehouse names in distinct ERP instances and sums decimals without floating point", async () => {
    fixtures([column("east", "one"), column("west", "two")], {one: "2.7", two: "0.049"});
    const result = await computeSupplierOrderSnapshot("company", ["A", "ZERO"]);
    expect(result.snapshots.get("A")).toEqual({
      totalStock: "2.749", totalRop: "10",
      columns: [
        { columnKey: "east", erpInstanceId: "one", itemCode: "A", warehouses: ["Main"] },
        { columnKey: "west", erpInstanceId: "two", itemCode: "A", warehouses: ["Main"] },
      ],
    });
    expect(result.totalOrderQty.get("A")).toBe(8);
    expect(result.snapshots.get("ZERO")).toMatchObject({totalStock: "0", totalRop: "0"});
    expect(getAllOsfErpInstances).toHaveBeenCalledWith("company");
    expect(prisma.productOsfRop.findMany).toHaveBeenCalledWith({where:{companyId:"company",sku:{in:["A","ZERO"]}}});
  });

  it("omits missing stock or ROP and refuses incompatible or overlapping scopes", async () => {
    fixtures([column("east", "one"), column("west", "two")], {one:"0"});
    const partial = await computeSupplierOrderSnapshot("co", ["A", "MISSING"]);
    expect(partial.snapshots.get("A")).toMatchObject({totalRop:"10"});
    expect(partial.snapshots.get("A")).not.toHaveProperty("totalStock");
    expect(partial.snapshots.get("MISSING")).not.toHaveProperty("totalRop");

    fixtures([column("east", "one"), column("west", "one")], {one:"1"});
    const overlapping = (await computeSupplierOrderSnapshot("co", ["A"])).snapshots.get("A");
    expect(overlapping).not.toHaveProperty("totalStock");
    expect(overlapping).not.toHaveProperty("totalRop");

    fixtures([column("east", "one"), {...column("west", "two"), includeInRop:false}], {one:"1",two:"2"});
    expect((await computeSupplierOrderSnapshot("co", ["A"])).snapshots.has("A")).toBe(false);
  });
});


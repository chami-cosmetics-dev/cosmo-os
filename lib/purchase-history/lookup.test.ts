import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  productItem: { findMany: vi.fn() },
  erpnextInstance: { findFirst: vi.fn() },
  companyLocation: { findFirst: vi.fn() },
} }));

import { GET } from "@/app/api/integrations/supplier-portal/v1/purchase-history/route";
import { fetchPurchaseHistory } from "@/lib/osf/purchase-history";
import { createPurchaseHistoryHandler, summaries } from "@/lib/purchase-history/lookup";
import { prisma } from "@/lib/prisma";

const token = "fixture_token_12345678901234567890";
const binding = {
  purpose: "purchase-history:read", companyId: "cosmo-company",
  expiresAt: "2099-12-31T00:00:00Z", tokenHash: createHash("sha256").update(token).digest("hex"),
  erpCompanies: { "erp-one": "Company A", "erp-two": "Company B" },
};
const config = () => JSON.stringify({ portal: binding });
const requestId = "18c5aef2-8cac-409a-8e3b-65d56729ba1c";
function request(query: Record<string, string> = {}, destination = "portal", accessToken = token) {
  const params = new URLSearchParams({
    requestId, sku: "SKU-1", itemCode: "SKU-1", instanceId: "erp-one",
    from: "2026-01-01", to: "2026-06-01", ...query,
  });
  return new Request("https://cosmo.invalid/api/integrations/supplier-portal/v1/purchase-history?" + params, {
    headers: { Authorization: "Bearer " + accessToken, "X-Portal-Company-Id": destination },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

const invoice = {
  company: "Company A", item_code: "SKU-1", name: "INV-1", idx: 1,
  supplier: "SUP-1", supplier_name: "Supplier One", posting_date: "2026-05-10",
  docstatus: 1, status: "Paid", is_return: 0, qty: "2.5", rate: "10.00", net_rate: "10.00",
  uom: "Each", stock_uom: "Each", conversion_factor: "1.000",
  currency: "LKR", total_taxes_and_charges: "0", discount_amount: "0", discount_percentage: "5",
  purchase_order: "PO-1", purchase_receipt: "PR-1",
};
const erp = { cfg: { baseUrl: "https://erp.invalid", apiKey: "fixture", apiSecret: "fixture" },
  erpCompany: "Company A", itemCode: "SKU-1", from: "2026-01-01", to: "2026-06-01" };

describe("ERP purchasing history", () => {
  it("uses the exact item and company, retains invoice lineage and excludes ignored documents", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: [
      invoice, invoice, { ...invoice, idx: 2, net_rate: "12" },
      { ...invoice, name: "INV-2", supplier: "SUP-2", is_return: 1 },
      { ...invoice, name: "INV-3", supplier: "SUP-2", docstatus: 2 },
      { ...invoice, name: "INV-4", supplier: "SUP-2", qty: "-1" },
      { ...invoice, name: "INV-5", supplier: "SUP-2", is_return: null },
      { ...invoice, name: "INV-6", supplier: "SUP-2", supplier_name: "Supplier Two", net_rate: "9" },
    ] }));
    vi.stubGlobal("fetch", transport);
    const result = await fetchPurchaseHistory(erp);
    expect(result.records).toHaveLength(3);
    expect(result.records.find(row => row.reference === "INV-1" && row.line === "1")).toMatchObject({ reference: "INV-1", quantity: "2.5", unitPrice: "10",
      documentType: "Purchase Invoice", purchaseOrder: "PO-1", purchaseReceipt: "PR-1", supplierId: "SUP-1" });
    const url = new URL(String(transport.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/resource/Purchase%20Invoice");
    expect(JSON.parse(url.searchParams.get("filters")!)).toContainEqual(["Purchase Invoice Item", "item_code", "=", "SKU-1"]);
    expect(JSON.parse(url.searchParams.get("filters")!)).toContainEqual(["company", "=", "Company A"]);
    expect(transport.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" });
  });

  it("compares only compatible currency, units, packs and verified tax and discount treatment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [
      { ...invoice, posting_time: "10:44:30" },
      { ...invoice, name: "ZZZ-EARLIER", posting_time: "9:15:00", net_rate: "13" },
      { ...invoice, name: "OLDER", posting_date: "2026-04-10", net_rate: "9.9999999999999999" },
      { ...invoice, name: "USD", currency: "USD", supplier: "SUP-2", net_rate: "1" },
      { ...invoice, name: "PACK", posting_date: "2026-03-10", conversion_factor: 12, net_rate: "2" },
      { ...invoice, name: "BOX", posting_date: "2026-03-10", uom: "Box", net_rate: "3" },
      { ...invoice, name: "VAT", posting_date: "2026-03-10", total_taxes_and_charges: "20", net_rate: "1" },
      { ...invoice, name: "DISCOUNT", posting_date: "2026-03-10", discount_amount: "10", net_rate: "1" },
    ] })));
    const result = summaries((await fetchPurchaseHistory(erp)).records);
    expect(result.latest.find(row => row.supplierId === "SUP-1")?.reference).toBe("INV-1");
    expect(result.lowest.map(row => row.reference).sort()).toEqual(["BOX", "OLDER", "PACK", "USD"]);
  });

  it("paginates ERP input and refuses unexpectedly scoped records", async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: Array.from({ length: 50 }, (_, i) => ({ ...invoice, idx: i + 1 })) }))
      .mockResolvedValueOnce(Response.json({ data: [{ ...invoice, idx: 51 }] }))
      .mockResolvedValueOnce(Response.json({ data: [{ ...invoice, company: "foreign" }] }));
    vi.stubGlobal("fetch", transport);
    expect((await fetchPurchaseHistory(erp)).records).toHaveLength(51);
    expect(new URL(String(transport.mock.calls[1][0])).searchParams.get("limit_start")).toBe("50");
    await expect(fetchPurchaseHistory(erp)).rejects.toThrow("Unexpected invoice scope");
  });
});

describe("purpose-scoped history endpoint", () => {
  it("offers every approved ERP2 company and rejects unbound choices before loading", async () => {
    const load = vi.fn().mockResolvedValue({ status: "OK", instanceLabel: "ERP2", records: [], truncated: false, hasUnusableRows: false });
    const handler = createPurchaseHistoryHandler({
      config: () => JSON.stringify({ portal: { ...binding, erpCompanies: {
        "erp-one": "Company A", "erp-two": ["Company B", "Company C"],
      } } }), load,
    });
    const selection = await (await handler(request({ instanceId: "erp-two" }))).json();
    expect(selection).toMatchObject({ status: "SELECT_COMPANY", companies: ["Company B", "Company C"] });
    expect(load).not.toHaveBeenCalled();
    expect((await handler(request({ instanceId: "erp-two", erpCompany: "Other Company" }))).status).toBe(403);
    expect(load).not.toHaveBeenCalled();
    const selected = await (await handler(request({ instanceId: "erp-two", erpCompany: "Company C" }))).json();
    expect(selected).toMatchObject({ status: "OK", erpCompany: "Company C", companies: ["Company B", "Company C"] });
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ companyId: "cosmo-company", instanceId: "erp-two", erpCompany: "Company C" }));
  });

  it("checks purpose, expiry, tenant, instance and dates before any ERP work", async () => {
    const load = vi.fn();
    const handler = createPurchaseHistoryHandler({ config, load });
    expect((await handler(request({}, "other"))).status).toBe(401);
    expect((await handler(request({}, "portal", "wrong_token_123456789012345678901"))).status).toBe(401);
    expect((await handler(request({ instanceId: "foreign" }))).status).toBe(403);
    expect((await handler(request({ to: "2028-06-01" }))).status).toBe(422);
    const wrong = createPurchaseHistoryHandler({ config: () => JSON.stringify({ portal: { ...binding, purpose: "product-media:read" } }), load });
    expect((await wrong(request())).status).toBe(401);
    const expired = createPurchaseHistoryHandler({ config, load, now: () => Date.parse("2100-01-01") });
    expect((await expired(request())).status).toBe(401);
    expect(load).not.toHaveBeenCalled();
  });

  it("keeps colliding supplier IDs separate for ERP1 and ERP2 and paginates by the chosen instance", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ data: [invoice] }))
      .mockResolvedValueOnce(Response.json({ data: [{ ...invoice, company: "Company B", supplier_name: "Other supplier" }] }));
    vi.stubGlobal("fetch", transport);
    const load = vi.fn(async ({ erpCompany }: { erpCompany: string }) => ({
      status: "OK" as const, instanceLabel: erpCompany,
      ...await fetchPurchaseHistory({ ...erp, erpCompany }),
    }));
    const handler = createPurchaseHistoryHandler({ config, load });
    const first = await (await handler(request())).json();
    const second = await (await handler(request({ instanceId: "erp-two", offset: "25" }))).json();
    expect(first.latest).toMatchObject([{ supplierId: "SUP-1", supplierName: "Supplier One" }]);
    expect(second.latest).toMatchObject([{ supplierId: "SUP-1", supplierName: "Other supplier" }]);
    expect(second.records).toHaveLength(0);
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ instanceId: "erp-two", erpCompany: "Company B" }));
  });

  it("reports missing and ambiguous product mappings without an ERP call", async () => {
    vi.stubEnv("SUPPLIER_PORTAL_PURCHASE_HISTORY_BINDINGS_JSON", config());
    const transport = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", transport);
    vi.mocked(prisma.productItem.findMany).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "1" }, { id: "2" }] as never);
    vi.mocked(prisma.companyLocation.findFirst).mockResolvedValue({ id: "location" } as never);
    vi.mocked(prisma.erpnextInstance.findFirst).mockResolvedValue({ label: "ERP1" } as never);
    expect((await (await GET(request())).json()).status).toBe("MAPPING_UNAVAILABLE");
    expect((await (await GET(request())).json()).status).toBe("MAPPING_AMBIGUOUS");
    expect((await (await GET(request({ itemCode: "ALIAS" }))).json()).status).toBe("MAPPING_UNAVAILABLE");
    expect(prisma.erpnextInstance.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "erp-one", companyId: "cosmo-company" } }));
    expect(prisma.companyLocation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: "cosmo-company", erpnextInstanceId: "erp-one", erpnextCompany: "Company A" },
    }));
    expect(transport).not.toHaveBeenCalled();
  });

  it("requires the selected ERP2 company to belong to a location in the source company", async () => {
    vi.stubEnv("SUPPLIER_PORTAL_PURCHASE_HISTORY_BINDINGS_JSON", JSON.stringify({ portal: {
      ...binding, erpCompanies: { "erp-two": ["Company B", "Company C"] },
    } }));
    vi.mocked(prisma.productItem.findMany).mockResolvedValue([{ id: "product" }] as never);
    vi.mocked(prisma.erpnextInstance.findFirst).mockResolvedValue({ label: "ERP2", ...erp.cfg } as never);
    vi.mocked(prisma.companyLocation.findFirst).mockResolvedValue(null);
    const transport = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", transport);
    expect((await (await GET(request({ instanceId: "erp-two", erpCompany: "Company C" }))).json()).status).toBe("MAPPING_UNAVAILABLE");
    expect(prisma.companyLocation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: "cosmo-company", erpnextInstanceId: "erp-two", erpnextCompany: "Company C" },
    }));
    expect(transport).not.toHaveBeenCalled();
  });

  it("distinguishes an exact ERP Item with no invoices from an absent ERP Item", async () => {
    vi.stubEnv("SUPPLIER_PORTAL_PURCHASE_HISTORY_BINDINGS_JSON", config());
    vi.mocked(prisma.productItem.findMany).mockResolvedValue([{ id: "1" }] as never);
    vi.mocked(prisma.companyLocation.findFirst).mockResolvedValue({ id: "location" } as never);
    vi.mocked(prisma.erpnextInstance.findFirst).mockResolvedValue({ label: "ERP1", ...erp.cfg } as never);
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(Response.json({ data: [{ item_code: "SKU-1" }] }))
      .mockResolvedValueOnce(Response.json({ data: [] }));
    vi.stubGlobal("fetch", transport);
    expect((await (await GET(request())).json()).status).toBe("MAPPING_UNAVAILABLE");
    expect(transport).toHaveBeenCalledTimes(1);
    expect((await (await GET(request())).json())).toMatchObject({ status: "OK", records: [] });
    expect(new URL(String(transport.mock.calls[1][0])).pathname).toBe("/api/resource/Item");
    expect(new URL(String(transport.mock.calls[2][0])).pathname).toBe("/api/resource/Purchase%20Invoice");
  });

  it("distinguishes empty history from unavailable ERP without leaking errors", async () => {
    const load = vi.fn().mockResolvedValueOnce({
      status: "OK", instanceLabel: "ERP1", records: [], truncated: false, hasUnusableRows: false,
    }).mockRejectedValueOnce(Error("provider private error"));
    const handler = createPurchaseHistoryHandler({ config, load });
    expect(await (await handler(request())).json()).toMatchObject({ status: "OK", records: [], nextOffset: null });
    const result = await handler(request());
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ code: "HISTORY_UNAVAILABLE" });
  });
});

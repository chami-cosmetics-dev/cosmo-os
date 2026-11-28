import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/admin/reports/orders/route";
import { REPORT_DUMP_PERMISSIONS } from "@/lib/report-permissions";
import { formatCsvHeaderLine } from "@/lib/reports/csv";
import { DUMP_HAS_MORE_HEADER, DUMP_NEXT_CURSOR_HEADER, DUMP_TOTAL_HEADER } from "@/lib/reports/dump-download";
import { getOrderInvoiceCsvHeaders, getOrderInvoiceItemCsvHeaders } from "@/lib/reports/order-dump";

const db = vi.hoisted(() => ({
  order: { count: vi.fn(), findMany: vi.fn() },
  orderLineItem: { count: vi.fn() },
  adaptPurchaseHistory: { count: vi.fn(), findMany: vi.fn() },
  user: { findMany: vi.fn() },
  auditLog: { findMany: vi.fn() },
}));
const { authorize, logDownload } = vi.hoisted(() => ({
  authorize: vi.fn(),
  logDownload: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/rbac", () => ({ requirePermission: authorize }));
vi.mock("@/lib/report-download-log", () => ({ logReportDownload: logDownload }));
vi.mock("@/lib/approval-koko-list", () => ({ loadKokoRefNumbersForOrders: async () => new Map() }));
vi.mock("@/lib/merchant-groups", () => ({
  buildCouponToMerchantMap: () => new Map(),
  getMerchantGroupUserMap: async () => new Map(),
}));

const companyId = "company-a";
const orderId = "c" + "1".repeat(24);
const importedId = "c" + "2".repeat(24);
const imported = {
  id: importedId,
  salesInvoiceNo: "ADAPT-2019",
  salesInvoiceMasterId: "legacy-123",
  invoiceDate: new Date("2019-12-31T20:00:00Z"),
  ttlAmount: new Prisma.Decimal("895.50"),
  paymentMethod: null,
  rawPaymentContext: { cash: "0", card: "895.50" },
  financialStatus: "paid",
  merchantKnownName: "Merchant",
  origin: "adapt",
  importBatchId: null,
  locationName: "Legacy Location",
  companyLocation: null,
  company: { name: "Company A" },
  contact: { companyId, name: "Legacy Customer", phoneNumber: "0770000000", email: "legacy@example.com" },
  lineItems: [{ id: "line-1", itemCode: "SKU-1", itemName: "Legacy Item", quantity: 2, unitPrice: "447.75" }],
};

function request(query: string) {
  return new NextRequest(`https://cosmo.example.com/api/admin/reports/orders?${query}`);
}

function csvFields(line: string, headers: readonly string[]) {
  return Object.fromEntries(headers.map((header, index) => [header, line.split(",")[index]]));
}

async function csvWithBom(response: Response) {
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(await response.arrayBuffer());
}

describe("full invoice dumps", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authorize.mockResolvedValue({ ok: true, context: { user: { companyId, id: "user-a" } } });
    db.order.count.mockResolvedValue(1);
    db.orderLineItem.count.mockResolvedValue(0);
    db.adaptPurchaseHistory.count.mockResolvedValue(1);
    db.order.findMany.mockResolvedValue([]);
    db.adaptPurchaseHistory.findMany.mockResolvedValue([imported]);
    db.user.findMany.mockResolvedValue([]);
    db.auditLog.findMany.mockResolvedValue([]);
  });

  it("downloads system and imported invoice rows under a single existing header", async () => {
    db.order.findMany.mockResolvedValue([{
      id: orderId,
      createdAt: new Date("2026-11-15T08:30:00Z"),
      name: "COSMO-1",
      erpnextInvoiceId: "ERP-1",
      sourceName: "web",
      paymentGatewayNames: [],
      totalPrice: new Prisma.Decimal("2160"),
      returns: [],
      companyLocation: { name: "Cosmo Store", erpnextCompany: null },
      _count: { lineItems: 2 },
    }]);
    const first = await GET(request("report=invoice&range=all"));
    const firstCsv = await csvWithBom(first);
    const headers = getOrderInvoiceCsvHeaders();
    expect(first.status).toBe(200);
    expect(authorize).toHaveBeenCalledWith(REPORT_DUMP_PERMISSIONS.master);
    expect(db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId } }));
    expect(first.headers.get(DUMP_TOTAL_HEADER)).toBe("2");
    expect(first.headers.get(DUMP_HAS_MORE_HEADER)).toBe("1");
    expect(firstCsv.startsWith(formatCsvHeaderLine(headers))).toBe(true);
    expect(csvFields(firstCsv.split("\r\n")[1], headers)).toMatchObject({
      invoice_no: "COSMO-1", erp_invoice_id: "ERP-1", source_name: "Shopify", grand_total: "2160",
    });
    expect(logDownload).not.toHaveBeenCalled();

    const cursor = first.headers.get(DUMP_NEXT_CURSOR_HEADER)!;
    const second = await GET(request(`report=invoice&range=all&header=0&after=${encodeURIComponent(cursor)}`));
    expect(second.headers.get(DUMP_HAS_MORE_HEADER)).toBe("0");
    expect(db.adaptPurchaseHistory.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId } }));
    expect(csvFields(await second.text(), headers)).toMatchObject({
      invoice_no: "ADAPT-2019",
      erp_invoice_id: "legacy-123",
      source_name: "Adapt",
      customer_phone: "0770000000",
      invoice_date: "2020-01-01",
      month: "2020 : January",
      grand_total: "895.5",
      item_count: "1",
      payment_gateway: "Card Payment",
      completed_date: "",
    });
    expect(logDownload).toHaveBeenCalledOnce();
  });

  it("continues imported item pages with the stored line amounts and company-scoped cursors", async () => {
    const invoice = {
      ...imported,
      origin: "vault_supplement_import",
      importBatchId: "vsupp-2026",
      contact: { ...imported.contact, companyId: "company-b" },
      lineItems: [{ ...imported.lineItems[0], lineAmount: "800" }],
    };
    const records = Array.from({ length: 251 }, (_, index) => ({
      ...invoice,
      id: `c${String(index).padStart(24, "0")}`,
    }));
    db.adaptPurchaseHistory.findMany.mockResolvedValueOnce(records).mockResolvedValueOnce([{
      ...records[250], lineItems: null,
    }]);

    const first = await GET(request("report=invoice-item&range=all"));
    const headers = getOrderInvoiceItemCsvHeaders();
    expect(await csvWithBom(first)).toBe(formatCsvHeaderLine(headers));
    const history = await GET(request("report=invoice-item&range=all&header=0&after=history%3A"));
    const rows = (await history.text()).trimEnd().split("\r\n");
    expect(rows).toHaveLength(250);
    expect(csvFields(rows[0], headers)).toMatchObject({
      invoice_no: "ADAPT-2019",
      source_name: "File import",
      location_name: "Legacy Location",
      customer_phone: "",
      sku: "SKU-1",
      quantity: "2",
      unit_price_total: "895.5",
      after_discount_total: "800",
      grand_total: "800",
    });

    const cursor = history.headers.get(DUMP_NEXT_CURSOR_HEADER)!;
    const last = await GET(request(`report=invoice-item&range=all&header=0&after=${encodeURIComponent(cursor)}`));
    expect(db.adaptPurchaseHistory.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { companyId },
      cursor: { id: records[249].id, companyId },
    }));
    expect(last.headers.get(DUMP_HAS_MORE_HEADER)).toBe("0");
    expect(await last.text()).toBe("");
  });

  it("denies access before querying either data source", async () => {
    authorize.mockResolvedValue({ ok: false, status: 403, error: "Permission denied" });
    const response = await GET(request("report=invoice-item&range=all&after=history%3A"));
    expect(authorize).toHaveBeenCalledWith(REPORT_DUMP_PERMISSIONS.master);
    expect(response.status).toBe(403);
    expect(db.order.findMany).not.toHaveBeenCalled();
    expect(db.adaptPurchaseHistory.findMany).not.toHaveBeenCalled();
  });

  it("keeps year-by-year downloads scoped to system orders and their existing permission", async () => {
    const response = await GET(request("report=invoice&range=custom&from=2019-01-01&to=2019-12-31"));
    expect(response.status).toBe(200);
    expect(authorize).toHaveBeenCalledWith(REPORT_DUMP_PERMISSIONS.historicalInvoice);
    expect(response.headers.get(DUMP_HAS_MORE_HEADER)).toBe("0");
    expect(db.adaptPurchaseHistory.findMany).not.toHaveBeenCalled();
  });
});

import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/admin/reports/orders/route";
import { REPORT_DUMP_PERMISSIONS } from "@/lib/report-permissions";
import { formatCsvHeaderLine } from "@/lib/reports/csv";
import { DUMP_HAS_MORE_HEADER, DUMP_TOTAL_HEADER } from "@/lib/reports/dump-download";
import {
  getHistoricalOrderInvoiceCsvHeaders,
} from "@/lib/reports/adapt-history-dump";

const db = vi.hoisted(() => ({
  order: { count: vi.fn(), findMany: vi.fn() },
  orderLineItem: { count: vi.fn() },
  adaptPurchaseHistory: { count: vi.fn(), findMany: vi.fn() },
  productItem: { findMany: vi.fn() },
  vendor: { findMany: vi.fn() },
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
  contact: {
    companyId,
    name: "Legacy Customer",
    phoneNumber: "0770000000",
    email: "legacy@example.com",
    address: null,
  },
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

describe("year-by-year invoice dumps", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authorize.mockResolvedValue({ ok: true, context: { user: { companyId, id: "user-a" } } });
    db.order.count.mockResolvedValue(1);
    db.orderLineItem.count.mockResolvedValue(0);
    db.adaptPurchaseHistory.count.mockResolvedValue(1);
    db.order.findMany.mockResolvedValue([]);
    db.adaptPurchaseHistory.findMany.mockResolvedValue([imported]);
    db.productItem.findMany.mockResolvedValue([]);
    db.vendor.findMany.mockResolvedValue([{ name: "OGX" }, { name: "The Ordinary" }]);
    db.user.findMany.mockResolvedValue([]);
    db.auditLog.findMany.mockResolvedValue([]);
  });

  it("includes Adapt history then Cosmo orders for year-by-year downloads", async () => {
    db.order.count.mockResolvedValue(0);
    db.adaptPurchaseHistory.count.mockResolvedValue(1);
    const response = await GET(request("report=invoice&range=custom&from=2019-01-01&to=2019-12-31"));
    const csv = await csvWithBom(response);
    const headers = getHistoricalOrderInvoiceCsvHeaders();
    expect(response.status).toBe(200);
    expect(authorize).toHaveBeenCalledWith(REPORT_DUMP_PERMISSIONS.historicalInvoice);
    expect(response.headers.get(DUMP_TOTAL_HEADER)).toBe("1");
    expect(response.headers.get(DUMP_HAS_MORE_HEADER)).toBe("0");
    expect(db.adaptPurchaseHistory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        companyId,
        invoiceDate: {
          gte: expect.any(Date),
          lte: expect.any(Date),
        },
      },
    }));
    expect(csv.startsWith(formatCsvHeaderLine(headers))).toBe(true);
    expect(csvFields(csv.split("\r\n")[1], headers)).toMatchObject({
      invoice_no: "ADAPT-2019",
      data_source: "Adapt history",
    });
  });
});

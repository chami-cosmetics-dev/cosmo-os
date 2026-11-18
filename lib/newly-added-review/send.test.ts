import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Builds a real Excel file; can pass 5s when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });

/** Send paths without ERP or Maileroo: once per month, empty recipients, test link never logged. */

const { sendStockHealthSummaryEmail, log } = vi.hoisted(() => ({
  sendStockHealthSummaryEmail: vi.fn(async () => ({ success: true }) as { success: boolean; message?: string }),
  log: new Map<string, { status: string }>(),
}));

const key = (w: { companyId_mailDate_part: { companyId: string; mailDate: string; part: string } }) =>
  `${w.companyId_mailDate_part.companyId}|${w.companyId_mailDate_part.mailDate}|${w.companyId_mailDate_part.part}`;

vi.mock("@/lib/maileroo", () => ({ sendStockHealthSummaryEmail }));
vi.mock("@/lib/prisma", async () => {
  const { Prisma } = await import("@prisma/client");
  return {
    prisma: {
      company: { findMany: vi.fn(async () => [{ id: "co1" }]) },
      stockHealthSummaryMail: {
        findUnique: vi.fn(async ({ where }) => log.get(key(where)) ?? null),
        create: vi.fn(async ({ data }) => {
          const k = `${data.companyId}|${data.mailDate}|${data.part}`;
          if (log.has(k)) throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" });
          log.set(k, { status: data.status });
          return data;
        }),
        updateMany: vi.fn(async ({ where, data }) => {
          const k = `${where.companyId}|${where.mailDate}|${where.part}`;
          const row = log.get(k);
          if (row && row.status === where.status) {
            row.status = data.status;
            return { count: 1 };
          }
          return { count: 0 };
        }),
        update: vi.fn(async ({ where, data }) => {
          log.get(key(where))!.status = data.status;
          return {};
        }),
      },
    },
  };
});
vi.mock("@/lib/item-trends/catalog", () => ({
  loadSkuCatalog: vi.fn(async () =>
    new Map([
      ["OLD_1", { sku: "OLD_1", title: "Old item", erp1ProductPriority: "Newly Added", erp2ProductPriority: null }],
      ["NEW_1", { sku: "NEW_1", title: "New item", erp1ProductPriority: null, erp2ProductPriority: "Newly Added" }],
      ["TOP_1", { sku: "TOP_1", title: "Top item", erp1ProductPriority: "Top", erp2ProductPriority: null }],
    ]),
  ),
}));
vi.mock("@/lib/sales-budget/sales-data", () => ({
  getSalesBudgetSalesData: vi.fn(async () => ({
    bySku: new Map([
      [
        "OLD_1",
        [
          // Same month across channels is summed: 5 + 4 = 9.
          { month: "2026-06", pos: true, warehouse: "OGF Shop Warehouse - Cosmo", merchantId: null, qty: 5 },
          { month: "2026-06", pos: false, warehouse: null, merchantId: "m1", qty: 4 },
          { month: "2026-08", pos: false, warehouse: null, merchantId: "m2", qty: 7 },
          { month: "2026-04", pos: true, warehouse: "x", merchantId: null, qty: 50 }, // before created
        ],
      ],
    ]),
  })),
}));
vi.mock("@/lib/osf/erp-stock", () => ({ getAllOsfErpInstances: vi.fn(async () => [{ cfg: {} }]) }));
vi.mock("@/lib/item-trends/stock-balance-report", () => ({
  getLiveStockBalances: vi.fn(async () => [
    { sku: "OLD_1", warehouse: "Main Warehouse - Cosmo", qty: 4 },
    { sku: "OLD_1", warehouse: "Shop Warehouse - LWK", qty: 3 },
  ]),
}));
vi.mock("@/lib/item-trends/stock-trends", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/item-trends/stock-trends")>()),
  fetchStockLedgerEntries: vi.fn(async () => [
    { itemCode: "OLD_1", postingDate: "2026-05-10", postingAt: new Date("2026-05-10T10:00:00Z"), creationAt: new Date("2026-05-10T10:00:00Z"), voucherNo: "PR-1", warehouse: "Main Warehouse - Cosmo", inQty: 10, outQty: 0, balanceQty: 10, voucherType: "Purchase Receipt" },
    { itemCode: "NEW_1", postingDate: "2026-10-02", postingAt: new Date("2026-10-02T10:00:00Z"), creationAt: new Date("2026-10-02T10:00:00Z"), voucherNo: "PR-2", warehouse: "Main Warehouse - Cosmo", inQty: 6, outQty: 0, balanceQty: 6, voucherType: "Purchase Receipt" },
  ]),
}));

const ENV = "NEWLY_ADDED_REVIEW_MAIL_RECIPIENTS";

beforeEach(() => {
  log.clear();
  sendStockHealthSummaryEmail.mockClear();
  process.env[ENV] = "a@x.lk, b@x.lk";
});
afterEach(() => {
  delete process.env[ENV];
});

describe("scheduled send", () => {
  it("sends once with the Excel, then never again that month", async () => {
    const { sendScheduledNewlyAddedReviewMail } = await import("@/lib/newly-added-review/send");
    const first = await sendScheduledNewlyAddedReviewMail("co1", "2026-11");
    expect(first).toMatchObject({ status: "sent", needsCheck: 1, allNewlyAdded: 2, recipientCount: 2 });
    const [input] = sendStockHealthSummaryEmail.mock.calls[0] as unknown as [
      { toEmails: string[]; subject: string; html: string; attachments: Array<{ fileName: string }> },
    ];
    expect(input.toEmails).toEqual(["a@x.lk", "b@x.lk"]);
    expect(input.subject).toBe("Newly Added Priority Review - November 2026");
    expect(input.html).not.toContain("TEST MAIL");
    expect(input.attachments.map((a) => a.fileName)).toEqual(["newly-added-priority-review-2026-11.xlsx"]);
    expect(log.get("co1|2026-11|newly_added_review")).toEqual({ status: "sent" });

    expect((await sendScheduledNewlyAddedReviewMail("co1", "2026-11")).status).toBe("skipped_already_sent");
    expect(sendStockHealthSummaryEmail).toHaveBeenCalledTimes(1);
    // A new month sends again.
    expect((await sendScheduledNewlyAddedReviewMail("co1", "2026-12")).status).toBe("sent");
  });

  it("empty recipients: not sent, logged clearly", async () => {
    process.env[ENV] = " ";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendScheduledNewlyAddedReviewMail } = await import("@/lib/newly-added-review/send");
    expect((await sendScheduledNewlyAddedReviewMail("co1", "2026-11")).status).toBe("skipped_no_recipients");
    expect(sendStockHealthSummaryEmail).not.toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toContain("NEWLY_ADDED_REVIEW_MAIL_RECIPIENTS is empty");
    warn.mockRestore();
  });

  it("a failed send can be retried the same month", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendStockHealthSummaryEmail.mockResolvedValueOnce({ success: false, message: "down" });
    const { sendScheduledNewlyAddedReviewMail } = await import("@/lib/newly-added-review/send");
    expect((await sendScheduledNewlyAddedReviewMail("co1", "2026-11")).status).toBe("failed");
    expect((await sendScheduledNewlyAddedReviewMail("co1", "2026-11")).status).toBe("sent");
  });
});

describe("test link", () => {
  it("sends [TEST] with the Excel and does not mark the month as sent", async () => {
    const { sendTestNewlyAddedReviewMail, sendScheduledNewlyAddedReviewMail } = await import("@/lib/newly-added-review/send");
    const result = await sendTestNewlyAddedReviewMail("co1", ["me@x.lk"], { mailMonth: "2026-11" });
    expect(result.status).toBe("sent");
    const [input] = sendStockHealthSummaryEmail.mock.calls[0] as unknown as [{ subject: string; attachments: unknown[] }];
    expect(input.subject).toBe("[TEST] Newly Added Priority Review - November 2026");
    expect(input.attachments).toHaveLength(1);
    expect(log.size).toBe(0);
    expect((await sendScheduledNewlyAddedReviewMail("co1", "2026-11")).status).toBe("sent");
  });

  it("preview returns the HTML and sends nothing", async () => {
    const { sendTestNewlyAddedReviewMail } = await import("@/lib/newly-added-review/send");
    const result = await sendTestNewlyAddedReviewMail("co1", [], { preview: true, mailMonth: "2026-11" });
    expect(result.status).toBe("preview");
    expect(result.html).toContain("<strong>1</strong> item has been Newly Added for 3 months or more");
    expect(result.html).toMatch(/May 2026<\/td><td[^>]*>1<\/td>/);
    expect(sendStockHealthSummaryEmail).not.toHaveBeenCalled();
    expect(log.size).toBe(0);
  });

  it("uses Item Trends' created date and live stock across all warehouses", async () => {
    const { loadNewlyAddedReview } = await import("@/lib/newly-added-review/send");
    const review = await loadNewlyAddedReview("co1", "2026-11");
    expect(review.all.map((r) => [r.sku, r.createdDate, r.durationMonths, r.currentStock])).toEqual([
      ["OLD_1", "2026-05-10", 6, 7],
      ["NEW_1", "2026-10-02", 1, 0],
    ]);
    // Sheet 1: best month May–October, all channels summed.
    expect(review.needsCheck.map((r) => [r.sku, r.maxSaleQty])).toEqual([["OLD_1", 9]]);
  });
});

describe("test link ?excel=1", () => {
  it("returns the same Excel as the mail, sends nothing, logs nothing", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { buildNewlyAddedReviewExcel } = await import("@/lib/newly-added-review/send");
    const { fileName, buffer } = await buildNewlyAddedReviewExcel("co1", "2026-11");
    expect(fileName).toBe("newly-added-priority-review-2026-11.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Needs Priority Check", "All Newly Added"]);
    expect(sendStockHealthSummaryEmail).not.toHaveBeenCalled();
    expect(log.size).toBe(0);
  });
});

describe("cron (every Tuesday): sends only on the month's send day", () => {
  it("other Tuesdays send nothing; the send day sends once", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendScheduledNewlyAddedReviewMailForAllCompanies } = await import("@/lib/newly-added-review/send");
    for (const day of ["2026-11-03", "2026-11-10", "2026-11-17"]) {
      const [r] = await sendScheduledNewlyAddedReviewMailForAllCompanies(day);
      expect(r.status, day).toBe("skipped_wrong_day");
    }
    expect(sendStockHealthSummaryEmail).not.toHaveBeenCalled();

    const [sent] = await sendScheduledNewlyAddedReviewMailForAllCompanies("2026-11-24");
    expect(sent).toMatchObject({ status: "sent", mailMonth: "2026-11" });

    // December: the first Tuesday (1st) sends; the 8th does not.
    expect((await sendScheduledNewlyAddedReviewMailForAllCompanies("2026-12-08"))[0].status).toBe("skipped_wrong_day");
    expect((await sendScheduledNewlyAddedReviewMailForAllCompanies("2026-12-01"))[0].status).toBe("sent");
    expect(sendStockHealthSummaryEmail).toHaveBeenCalledTimes(2);
  });
});

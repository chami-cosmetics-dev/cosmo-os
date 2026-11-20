import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Builds a real Excel file; can pass 5s when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });

/** Send paths without ERP or Maileroo: once per month, empty recipients, test link never logged. */

const { sendStockHealthSummaryEmail, sendErpSyncFailureAlertEmail, log, saved } = vi.hoisted(() => ({
  sendStockHealthSummaryEmail: vi.fn(async () => ({ success: true }) as { success: boolean; message?: string }),
  sendErpSyncFailureAlertEmail: vi.fn(async () => ({ success: true })),
  log: new Map<string, { status: string }>(),
  /** The saved Email Template (Settings → Email Templates); null = never saved. */
  saved: {
    template: null as null | { name: string; subject: string; bodyHtml: string; recipients: string; ccRecipients: string },
  },
}));

const key = (w: { companyId_mailDate_part: { companyId: string; mailDate: string; part: string } }) =>
  `${w.companyId_mailDate_part.companyId}|${w.companyId_mailDate_part.mailDate}|${w.companyId_mailDate_part.part}`;

vi.mock("@/lib/maileroo", () => ({ sendStockHealthSummaryEmail, sendErpSyncFailureAlertEmail }));
vi.mock("@/lib/rbac", () => ({
  requirePermission: vi.fn(async () => ({ ok: true, context: { user: { id: "u1" } } })),
}));
vi.mock("@/lib/prisma", async () => {
  const { Prisma } = await import("@prisma/client");
  return {
    prisma: {
      company: {
        findMany: vi.fn(async () => [{ id: "co1" }]),
        findUnique: vi.fn(async () => ({ name: "Test Co" })),
      },
      user: { findUnique: vi.fn(async () => ({ companyId: "co1" })) },
      emailTemplate: {
        findUnique: vi.fn(async ({ where }: { where: { companyId_key: { key: string } } }) =>
          where.companyId_key.key === "newly_added_priority_review" ? saved.template : null,
        ),
      },
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

beforeEach(() => {
  log.clear();
  sendStockHealthSummaryEmail.mockClear();
  sendErpSyncFailureAlertEmail.mockClear();
  // Saved with To + CC, Subject / Body left as the defaults (blank).
  saved.template = { name: "Newly Added Priority Review", subject: "", bodyHtml: "", recipients: "a@x.lk, b@x.lk", ccRecipients: "c@x.lk" };
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("scheduled send", () => {
  it("sends once with the Excel, then never again that month", async () => {
    const { sendScheduledNewlyAddedReviewMail } = await import("@/lib/newly-added-review/send");
    const first = await sendScheduledNewlyAddedReviewMail("co1", "2026-11");
    expect(first).toMatchObject({ status: "sent", needsCheck: 1, allNewlyAdded: 2, recipientCount: 3 });
    const [input] = sendStockHealthSummaryEmail.mock.calls[0] as unknown as [
      { toEmails: string[]; ccEmails: string[]; subject: string; html: string; attachments: Array<{ fileName: string }> },
    ];
    // To / CC from the Email Template.
    expect(input.toEmails).toEqual(["a@x.lk", "b@x.lk"]);
    expect(input.ccEmails).toEqual(["c@x.lk"]);
    expect(input.subject).toBe("Newly Added Priority Review - November 2026");
    expect(input.html).not.toContain("TEST MAIL");
    expect(input.attachments.map((a) => a.fileName)).toEqual(["newly-added-priority-review-2026-11.xlsx"]);
    expect(log.get("co1|2026-11|newly_added_review")).toEqual({ status: "sent" });

    expect((await sendScheduledNewlyAddedReviewMail("co1", "2026-11")).status).toBe("skipped_already_sent");
    expect(sendStockHealthSummaryEmail).toHaveBeenCalledTimes(1);
    // A new month sends again.
    expect((await sendScheduledNewlyAddedReviewMail("co1", "2026-12")).status).toBe("sent");
  });

  it("no To in the Email Template (or never saved): not sent, logged clearly", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendScheduledNewlyAddedReviewMail } = await import("@/lib/newly-added-review/send");
    saved.template = { ...saved.template!, recipients: " " };
    expect((await sendScheduledNewlyAddedReviewMail("co1", "2026-11")).status).toBe("skipped_no_recipients");
    saved.template = null;
    expect((await sendScheduledNewlyAddedReviewMail("co1", "2026-11")).status).toBe("skipped_no_recipients");
    expect(sendStockHealthSummaryEmail).not.toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toContain("has no To recipients");
    expect(warn.mock.calls[0][0]).toContain("Settings → Email Templates");
  });

  it("uses the Subject / Body edited in Email Templates", async () => {
    saved.template = {
      ...saved.template!,
      subject: "Review for {{reportMonth}} ({{needsCheckCount}} items)",
      bodyHtml: "<p>Hello team,</p>{{openingHtml}}{{decisionTableHtml}}",
    };
    const { sendScheduledNewlyAddedReviewMail } = await import("@/lib/newly-added-review/send");
    await sendScheduledNewlyAddedReviewMail("co1", "2026-11");
    const [input] = sendStockHealthSummaryEmail.mock.calls[0] as unknown as [{ subject: string; html: string }];
    expect(input.subject).toBe("Review for November 2026 (1 items)");
    expect(input.html).toContain("<p>Hello team,</p>");
    expect(input.html).toContain("Items needing a decision");
    expect(input.html).not.toContain("Sheet 1");
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

describe("Settings → Email Templates → Send test mail", () => {
  it("sends this month's real review with the Excel attached", async () => {
    const { POST } = await import("@/app/api/admin/company/email-templates/test-send/route");
    const { NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE } = await import("@/lib/newly-added-review/mail-templates");
    const res = await POST(
      new Request("http://localhost/api/admin/company/email-templates/test-send", {
        method: "POST",
        body: JSON.stringify({
          key: NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE.key,
          name: NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE.name,
          subject: NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE.subject,
          bodyHtml: NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE.bodyHtml,
          recipients: "me@x.lk",
        }),
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(sendErpSyncFailureAlertEmail).toHaveBeenCalledTimes(1);
    const [input] = sendErpSyncFailureAlertEmail.mock.calls[0] as unknown as [
      { subject: string; html: string; attachments?: Array<{ fileName: string; contentBase64: string }> },
    ];
    expect(input.subject).toMatch(/^\[TEST\] Newly Added Priority Review - /);
    expect(input.html).toContain("Sheet 1");
    expect(input.html).not.toContain("{{");
    expect(input.attachments?.map((a) => a.fileName)).toEqual([
      expect.stringMatching(/^newly-added-priority-review-\d{4}-\d{2}\.xlsx$/),
    ]);
    expect(input.attachments![0].contentBase64.length).toBeGreaterThan(0);
    expect(log.size).toBe(0);
  });

  it("the template is listed as a built-in (no recipients by default)", async () => {
    const { builtinTemplateByKey } = await import("@/lib/email-templates/catalog");
    expect(builtinTemplateByKey("newly_added_priority_review")).toMatchObject({
      name: "Newly Added Priority Review",
      recipients: "",
      ccRecipients: "",
      builtin: true,
      automated: true,
    });
  });
});

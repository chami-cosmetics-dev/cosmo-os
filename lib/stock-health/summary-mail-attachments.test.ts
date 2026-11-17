import * as XLSX from "xlsx-js-style";
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Builds real Excel files; can pass 5s when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });

import {
  buildCommonSkuRows,
  buildRopRows,
  parseExcludedSkus,
  skuKey,
  type StockHealthItem,
} from "@/lib/stock-health/calc";
import { STOCK_HEALTH_MAIL_TEMPLATES } from "@/lib/stock-health/summary-mail-html";

/**
 * Proves every Stock Health mail path carries the Excel attachments, without Maileroo or ERP:
 * the scheduled send, the /summary-mail/test URL, and Settings → Email Templates "Send test mail".
 */

const { sendStockHealthSummaryEmail, sendErpSyncFailureAlertEmail, prisma } = vi.hoisted(() => ({
  sendStockHealthSummaryEmail: vi.fn(async () => ({ success: true })),
  sendErpSyncFailureAlertEmail: vi.fn(async () => ({ success: true })),
  prisma: {
    emailTemplate: { findUnique: vi.fn(async () => ({ recipients: "to@example.com", ccRecipients: "" })) },
    company: { findUnique: vi.fn(async () => ({ name: "Test Co" })), findMany: vi.fn(async () => []) },
    user: { findUnique: vi.fn(async () => ({ companyId: "co1" })) },
    stockHealthSummaryMail: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async () => []),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/maileroo", () => ({ sendStockHealthSummaryEmail, sendErpSyncFailureAlertEmail }));
vi.mock("@/lib/rbac", () => ({
  requirePermission: vi.fn(async () => ({ ok: true, context: { user: { id: "u1" } } })),
}));

const items: StockHealthItem[] = [
  { sku: "AAA-01", brand: "BrandA", priority: "Top", siteStatus: "active", itemName: "Item A" },
  { sku: "BBB-01", brand: "BrandB", priority: "Low", siteStatus: "active", itemName: "Item B" },
  { sku: "CCC-01", brand: "BrandC", priority: "Discontinue", siteStatus: "active", itemName: "Item C" },
];
const stockBySku = new Map([
  [skuKey("AAA-01"), 40],
  [skuKey("BBB-01"), 0],
  [skuKey("CCC-01"), 5],
]);
const ropBySku = new Map([[skuKey("AAA-01"), 20], [skuKey("BBB-01"), 10]]);
const excluded = parseExcludedSkus([]);
const ropData = {
  items,
  stockBySku,
  stockByWarehouse: new Map(),
  fetchedAt: new Date("2026-11-16T05:00:00Z"),
  excluded,
  ropBySku,
  ropRows: buildRopRows(buildCommonSkuRows(items, stockBySku, excluded), ropBySku),
};

vi.mock("@/lib/stock-health/rop-status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stock-health/rop-status")>()),
  loadStockHealthRopData: vi.fn(async () => ropData),
}));
vi.mock("@/lib/stock-health/weekly-summary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stock-health/weekly-summary")>()),
  loadPreviousStockHealthSnapshot: vi.fn(async () => null),
  loadStockHealthSkuSnapshot: vi.fn(async () => []),
  stockHealthSnapshotWrites: vi.fn(() => []),
  stockHealthSkuSnapshotWrites: vi.fn(() => []),
}));
vi.mock("@/lib/shop-stock-status/load", () => ({
  loadShopStockStatus: vi.fn(async () => ({
    tabs: { shops: [], online: [] },
    fetchedAt: "2026-11-16T05:00:00.000Z",
  })),
}));

type Attachment = { fileName: string; contentType: string; contentBase64: string };

async function sheetNames(attachment: Attachment): Promise<string[]> {
  const buffer = Buffer.from(attachment.contentBase64, "base64");
  if (attachment.fileName.startsWith("shop-stock-status-")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb.worksheets.map((ws) => ws.name);
  }
  return XLSX.read(buffer, { type: "buffer" }).SheetNames;
}

async function expectAttachments(attachments: Attachment[] | undefined, part: "weekly" | "rop") {
  expect(attachments).toBeDefined();
  const files = attachments!;
  for (const a of files) {
    expect(a.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(a.contentBase64.length).toBeGreaterThan(0);
  }
  if (part === "weekly") {
    expect(files.map((a) => a.fileName)).toEqual(["stock-health-breakdown-2026-11-16.xlsx"]);
    expect(await sheetNames(files[0])).toEqual(["Summary", "Common SKUs", "Variants"]);
  } else {
    expect(files).toHaveLength(2);
    expect(files[0].fileName).toBe("stock-health-rop-status-2026-11-16.xlsx");
    expect(files[1].fileName).toMatch(/^shop-stock-status-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.xlsx$/);
    expect(await sheetNames(files[0])).toEqual(["Summary", "Common SKUs", "Variants"]);
    expect(await sheetNames(files[1])).toEqual(["SHOP", "ONLINE"]);
  }
}

beforeEach(() => {
  sendStockHealthSummaryEmail.mockClear();
  sendErpSyncFailureAlertEmail.mockClear();
});

describe("Settings → Email Templates → Send test mail", () => {
  it.each(["rop", "weekly"] as const)("attaches the %s mail's Excel files", async (part) => {
    const { POST } = await import("@/app/api/admin/company/email-templates/test-send/route");
    const res = await POST(
      new Request("http://localhost/api/admin/company/email-templates/test-send", {
        method: "POST",
        body: JSON.stringify({
          key: STOCK_HEALTH_MAIL_TEMPLATES[part].key,
          name: "Stock Health",
          subject: STOCK_HEALTH_MAIL_TEMPLATES[part].subject,
          bodyHtml: STOCK_HEALTH_MAIL_TEMPLATES[part].bodyHtml,
          recipients: "me@example.com",
        }),
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(sendErpSyncFailureAlertEmail).toHaveBeenCalledTimes(1);
    const [input] = sendErpSyncFailureAlertEmail.mock.calls[0] as unknown as [{ attachments?: Attachment[] }];
    await expectAttachments(input.attachments, part);
  });
});

describe("/summary-mail/test URL", () => {
  it("sends each mail with its own Excel files", async () => {
    const { sendTestStockHealthSummaryMail } = await import("@/lib/stock-health/summary-mail");
    const results = await sendTestStockHealthSummaryMail("co1", { to: ["me@example.com"], cc: [] });
    expect(results.map((r) => r.status)).toEqual(["sent", "sent"]);
    const calls = sendStockHealthSummaryEmail.mock.calls as unknown as Array<[{ subject: string; attachments?: Attachment[] }]>;
    expect(calls).toHaveLength(2);
    const byPart = new Map(results.map((r, i) => [r.part, calls[i][0]]));
    await expectAttachments(byPart.get("weekly")!.attachments, "weekly");
    await expectAttachments(byPart.get("rop")!.attachments, "rop");
  });
});

describe("scheduled Monday / Tuesday send", () => {
  it.each([
    ["rop", "2026-11-16"],
    ["weekly", "2026-11-17"],
  ] as const)("the %s mail goes out with its Excel files", async (part, mailDate) => {
    const { sendScheduledStockHealthMail } = await import("@/lib/stock-health/summary-mail");
    const result = await sendScheduledStockHealthMail("co1", part, mailDate);
    expect(result.status).toBe("sent");
    expect(sendStockHealthSummaryEmail).toHaveBeenCalledTimes(1);
    const [input] = sendStockHealthSummaryEmail.mock.calls[0] as unknown as [{ attachments?: Attachment[] }];
    await expectAttachments(input.attachments, part);
  });
});

describe("scheduled send fallback when the Excel files are rejected", () => {
  it("still sends the summary, without the Excel files and with a note", async () => {
    sendStockHealthSummaryEmail
      .mockResolvedValueOnce({ success: false, message: "Attachment too large" } as never)
      .mockResolvedValueOnce({ success: true });
    const { sendScheduledStockHealthMail } = await import("@/lib/stock-health/summary-mail");
    const result = await sendScheduledStockHealthMail("co1", "rop", "2026-11-16");

    expect(result.status).toBe("sent");
    expect(result.error).toBe("Sent without Excel attachments: Attachment too large");
    const calls = sendStockHealthSummaryEmail.mock.calls as unknown as Array<
      [{ html: string; plain: string; attachments?: Attachment[] }]
    >;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].attachments).toHaveLength(2);
    expect(calls[1][0].attachments).toEqual([]);
    expect(calls[1][0].html).toContain("The Excel attachments could not be included");
    expect(calls[1][0].html).toContain("Shop Stock Status → Export (SHOP + ONLINE)");
    expect(calls[1][0].plain).toContain("The Excel attachments could not be included");
  });

  it("reports failed when the retry without attachments also fails", async () => {
    sendStockHealthSummaryEmail
      .mockResolvedValueOnce({ success: false, message: "Attachment too large" } as never)
      .mockResolvedValueOnce({ success: false, message: "Service down" } as never);
    const { sendScheduledStockHealthMail } = await import("@/lib/stock-health/summary-mail");
    const result = await sendScheduledStockHealthMail("co1", "weekly", "2026-11-17");

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Attachment too large; retry without attachments: Service down");
    expect(sendStockHealthSummaryEmail).toHaveBeenCalledTimes(2);
  });
});

import "server-only";

import {
  STOCK_PRICE_MISSING_DAILY_KEY,
  builtinTemplateByKey,
} from "@/lib/email-templates/catalog";
import { parseEmailAddressList } from "@/lib/email-templates/render";
import { formatAppDateShort } from "@/lib/format-datetime";
import { sendErpSyncFailureAlertEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import { syncErpProductPriorities } from "@/lib/product-items/erp-priority-sync";
import { buildStockPriceMissingEmailContent } from "@/lib/stock-price-missing/build-content";
import { scanStockPriceMissing } from "@/lib/stock-price-missing/scan";
import {
  buildStockPriceMissingWorkbook,
  stockPriceMissingExcelFileName,
} from "@/lib/stock-price-missing/workbook";

export type StockPriceMissingEmailStatus =
  | "sent"
  | "failed"
  | "skipped_no_recipients"
  | "skipped_no_company"
  | "skipped_insufficient_erp"
  | "preview";

export { buildStockPriceMissingEmailContent };

async function resolveTemplate(companyId: string) {
  const stored = await prisma.emailTemplate.findUnique({
    where: {
      companyId_key: { companyId, key: STOCK_PRICE_MISSING_DAILY_KEY },
    },
  });
  const builtin = builtinTemplateByKey(STOCK_PRICE_MISSING_DAILY_KEY)!;
  const storedBody = stored?.bodyHtml?.trim() || "";
  const useStoredBody = storedBody.includes("{{erp1TableHtml}}");
  const storedSubject = stored?.subject?.trim() || "";
  const useStoredSubject = storedSubject.includes("{{erp1Count}}");
  return {
    subject: useStoredSubject ? storedSubject : builtin.subject,
    bodyHtml: useStoredBody ? storedBody : builtin.bodyHtml,
    recipients: stored?.recipients ?? builtin.recipients,
    ccRecipients: stored?.ccRecipients ?? builtin.ccRecipients,
    fromDb: Boolean(stored),
  };
}

export async function runStockPriceMissingDailyEmail(input?: {
  companyId?: string;
  preview?: boolean;
}): Promise<{
  status: StockPriceMissingEmailStatus;
  companyId?: string;
  companyName?: string;
  itemCount?: number;
  subject?: string;
  message?: string;
}> {
  const company = input?.companyId
    ? await prisma.company.findUnique({
        where: { id: input.companyId },
        select: { id: true, name: true },
      })
    : await prisma.company.findFirst({
        where: { name: { contains: "cosmetic", mode: "insensitive" } },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      });

  if (!company) {
    return { status: "skipped_no_company" };
  }

  const template = await resolveTemplate(company.id);
  const toEmails = parseEmailAddressList(template.recipients);
  const ccEmails = parseEmailAddressList(template.ccRecipients);
  if (toEmails.length === 0) {
    return {
      status: "skipped_no_recipients",
      companyId: company.id,
      companyName: company.name,
    };
  }

  let scan;
  try {
    // Refresh Cosmo Product Priority from ERP (Discontinue / Vat filters).
    // Scan also reads live ERP prices, brands, and priorities.
    try {
      await syncErpProductPriorities(company.id);
    } catch (syncErr) {
      console.warn(
        "[stock-price-missing] priority sync failed; scan still uses live ERP priorities",
        syncErr instanceof Error ? syncErr.message : syncErr,
      );
    }
    scan = await scanStockPriceMissing(company.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    if (/at least two ERP/i.test(message)) {
      return {
        status: "skipped_insufficient_erp",
        companyId: company.id,
        companyName: company.name,
        message,
      };
    }
    return {
      status: "failed",
      companyId: company.id,
      companyName: company.name,
      message,
    };
  }

  const built = buildStockPriceMissingEmailContent({
    companyName: company.name,
    scan,
    subjectTemplate: template.subject,
    bodyHtmlTemplate: template.bodyHtml,
  });
  const itemCount = scan.erp1.rows.length + scan.erp2.rows.length;
  const xlsx = buildStockPriceMissingWorkbook(scan);
  const excelName = stockPriceMissingExcelFileName(formatAppDateShort(new Date()));

  if (input?.preview) {
    return {
      status: "preview",
      companyId: company.id,
      companyName: company.name,
      itemCount,
      subject: built.subject,
    };
  }

  const send = await sendErpSyncFailureAlertEmail({
    toEmails,
    ccEmails,
    subject: built.subject,
    html: built.html,
    plain: built.plain,
    attachments: [
      {
        fileName: excelName,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        contentBase64: xlsx.toString("base64"),
      },
    ],
  });

  if (!send.success) {
    return {
      status: "failed",
      companyId: company.id,
      companyName: company.name,
      itemCount,
      subject: built.subject,
      message: send.message ?? "Email send failed",
    };
  }

  return {
    status: "sent",
    companyId: company.id,
    companyName: company.name,
    itemCount,
    subject: built.subject,
  };
}

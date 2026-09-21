import "server-only";

import {
  STOCK_PRICE_MISSING_DAILY_KEY,
  builtinTemplateByKey,
} from "@/lib/email-templates/catalog";
import { parseEmailAddressList } from "@/lib/email-templates/render";
import { sendErpSyncFailureAlertEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import { buildStockPriceMissingEmailContent } from "@/lib/stock-price-missing/build-content";
import { scanStockPriceMissing } from "@/lib/stock-price-missing/scan";

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
  const useStoredBody = storedBody.includes("{{erp2OgfMissingTableHtml}}");
  const storedSubject = stored?.subject?.trim() || "";
  const useStoredSubject = storedSubject.includes("{{erp2OgfMissingCount}}");
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

  if (input?.preview) {
    return {
      status: "preview",
      companyId: company.id,
      companyName: company.name,
      itemCount: scan.rows.length,
      subject: built.subject,
    };
  }

  const send = await sendErpSyncFailureAlertEmail({
    toEmails,
    ccEmails,
    subject: built.subject,
    html: built.html,
    plain: built.plain,
  });

  if (!send.success) {
    return {
      status: "failed",
      companyId: company.id,
      companyName: company.name,
      itemCount: scan.rows.length,
      subject: built.subject,
      message: send.message ?? "Email send failed",
    };
  }

  return {
    status: "sent",
    companyId: company.id,
    companyName: company.name,
    itemCount: scan.rows.length,
    subject: built.subject,
  };
}

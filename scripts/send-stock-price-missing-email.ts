/**
 * One-off: scan stock/price gaps and send report email.
 *
 *   node scripts/with-env.mjs cosmo-prod npx tsx --tsconfig tsconfig.scripts.json scripts/send-stock-price-missing-email.ts
 *   node scripts/with-env.mjs cosmo-prod npx tsx --tsconfig tsconfig.scripts.json scripts/send-stock-price-missing-email.ts --to you@example.com
 *   node scripts/with-env.mjs cosmo-prod npx tsx --tsconfig tsconfig.scripts.json scripts/send-stock-price-missing-email.ts --preview
 */
import { config as loadEnv, parse } from "dotenv";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

loadEnv({ path: resolve(process.cwd(), ".env.cosmo-prod"), override: true });

const mailerooPath = resolve(process.cwd(), ".env.maileroo.tmp");
if (existsSync(mailerooPath)) {
  const parsed = parse(readFileSync(mailerooPath));
  for (const key of ["MAILEROO_API_KEY", "MAILEROO_FROM_EMAIL"] as const) {
    if (parsed[key]) process.env[key] = parsed[key];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const preview = args.includes("--preview");
  const toIdx = args.indexOf("--to");
  const toOverrideRaw =
    toIdx >= 0 && args[toIdx + 1] ? args[toIdx + 1]!.trim().toLowerCase() : null;
  const toOverride = toOverrideRaw
    ? toOverrideRaw.split(/[,;]+/).map((e) => e.trim()).filter((e) => e.includes("@"))
    : null;

  const { prisma } = await import("../lib/prisma");
  const { builtinTemplateByKey, STOCK_PRICE_MISSING_DAILY_KEY } = await import(
    "../lib/email-templates/catalog"
  );
  const { parseEmailAddressList } = await import("../lib/email-templates/render");
  const { buildStockPriceMissingEmailContent } = await import(
    "../lib/stock-price-missing/build-content"
  );
  const { scanStockPriceMissing } = await import("../lib/stock-price-missing/scan");
  const {
    buildStockPriceMissingWorkbook,
    stockPriceMissingExcelFileName,
  } = await import("../lib/stock-price-missing/workbook");
  const { formatAppDateShort } = await import("../lib/format-datetime");
  const { sendErpSyncFailureAlertEmail } = await import("../lib/maileroo");

  if (!preview && (!process.env.MAILEROO_API_KEY || !process.env.MAILEROO_FROM_EMAIL)) {
    console.error("Missing MAILEROO_API_KEY / MAILEROO_FROM_EMAIL (or use --preview)");
    process.exit(1);
  }

  const company = await prisma.company.findFirst({
    where: { name: { contains: "cosmetic", mode: "insensitive" } },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!company) {
    console.error("No Cosmetics company found");
    process.exit(1);
  }

  console.log(`Scanning ${company.name} (${company.id})…`);
  try {
    const { syncErpProductPriorities } = await import(
      "../lib/product-items/erp-priority-sync"
    );
    console.log("Syncing Product Priority from ERP…");
    const sync = await syncErpProductPriorities(company.id);
    console.log(
      `Priority sync: updated=${sync.updatedRows} sources=${sync.sources
        .map((s) => `${s.id}:${s.status}`)
        .join(",")}`,
    );
  } catch (syncErr) {
    console.warn(
      "Priority sync failed; scan still uses live ERP priorities:",
      syncErr instanceof Error ? syncErr.message : syncErr,
    );
  }
  const scan = await scanStockPriceMissing(company.id);
  console.log(
    `ERP1[${scan.erp1.label}]=${scan.erp1.rows.length} (std=${scan.erp1.missingStandardCount} ogf=${scan.erp1.missingOgfCount} both=${scan.erp1.missingBothCount}) ` +
      `ERP2[${scan.erp2.label}]=${scan.erp2.rows.length} (std=${scan.erp2.missingStandardCount} ogf=${scan.erp2.missingOgfCount} both=${scan.erp2.missingBothCount})`,
  );

  const stored = await prisma.emailTemplate.findUnique({
    where: {
      companyId_key: { companyId: company.id, key: STOCK_PRICE_MISSING_DAILY_KEY },
    },
  });
  const builtin = builtinTemplateByKey(STOCK_PRICE_MISSING_DAILY_KEY)!;
  // One-off --to sends always use builtin body so stale/swapped DB HTML cannot confuse.
  const useBuiltin = Boolean(toOverride);
  const storedBody = stored?.bodyHtml?.trim() || "";
  const useStoredBody = !useBuiltin && storedBody.includes("{{erp1TableHtml}}");
  const storedSubject = stored?.subject?.trim() || "";
  const useStoredSubject = !useBuiltin && storedSubject.includes("{{erp1Count}}");
  const subjectTemplate = useStoredSubject ? storedSubject : builtin.subject;
  const bodyHtmlTemplate = useStoredBody ? storedBody : builtin.bodyHtml;
  if (useBuiltin) console.log("Using builtin template (override --to)");

  const built = buildStockPriceMissingEmailContent({
    companyName: company.name,
    scan,
    subjectTemplate,
    bodyHtmlTemplate,
  });

  const toEmails = toOverride
    ? toOverride
    : parseEmailAddressList(stored?.recipients ?? builtin.recipients);
  const ccEmails = toOverride
    ? []
    : parseEmailAddressList(stored?.ccRecipients ?? builtin.ccRecipients);

  console.log(`Subject: ${built.subject}`);
  console.log(`To: ${toEmails.join(", ") || "(none)"}`);
  console.log(`CC: ${ccEmails.join(", ") || "(none)"}`);

  if (preview) {
    console.log("Preview only — not sent.");
    process.exit(0);
  }

  const send = await sendErpSyncFailureAlertEmail({
    toEmails,
    ccEmails,
    subject: built.subject,
    html: built.html,
    plain: built.plain,
    attachments: [
      {
        fileName: stockPriceMissingExcelFileName(formatAppDateShort(new Date())),
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        contentBase64: buildStockPriceMissingWorkbook(scan).toString("base64"),
      },
    ],
  });

  if (!send.success) {
    console.error("Send failed:", send.message);
    process.exit(1);
  }

  console.log("Sent OK (Excel attached).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

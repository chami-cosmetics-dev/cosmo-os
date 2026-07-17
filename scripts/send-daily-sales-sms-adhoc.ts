/**
 * One-off ad-hoc Daily Sales SMS send to a SINGLE phone number.
 *
 * Does NOT modify the recipient list / config. Reads the company's Hutch SMS
 * portal credentials from the target database and sends yesterday's (or the
 * given date's) sales report to the provided number only.
 *
 * Usage:
 *   node scripts/with-env.mjs vault npx tsx scripts/send-daily-sales-sms-adhoc.ts <YYYY-MM-DD> <phone>
 *
 * Example (yesterday for Vault → 0766576655):
 *   node scripts/with-env.mjs vault npx tsx scripts/send-daily-sales-sms-adhoc.ts 2026-07-16 0766576655
 */
import {
  buildDailySalesReport,
  getPreviousColomboReportDate,
  isValidReportDate,
  normalizeRecipientList,
} from "../lib/daily-sales-sms";
import { sendSms } from "../lib/hutch-sms";
import { prisma } from "../lib/prisma";

async function main() {
  const reportDate = (process.argv[2] ?? "").trim() || getPreviousColomboReportDate();
  const phoneArg = (process.argv[3] ?? "").trim();

  if (!isValidReportDate(reportDate)) {
    console.error("Invalid reportDate. Usage: send-daily-sales-sms-adhoc.ts <YYYY-MM-DD> <phone>");
    process.exit(1);
  }
  const [phone] = normalizeRecipientList(phoneArg);
  if (!phone) {
    console.error("Invalid phone number. Usage: send-daily-sales-sms-adhoc.ts <YYYY-MM-DD> <phone>");
    process.exit(1);
  }

  // Resolve the target company: prefer the one with a Daily Sales SMS config,
  // otherwise fall back to the single company in this database.
  const smsConfig = await prisma.dailySalesSmsConfig.findFirst({
    select: { companyId: true },
  });
  const company =
    (smsConfig
      ? await prisma.company.findUnique({
          where: { id: smsConfig.companyId },
          select: { id: true, name: true },
        })
      : null) ??
    (await prisma.company.findFirst({ select: { id: true, name: true } }));

  if (!company) {
    console.error("No company found in the target database.");
    process.exit(1);
  }

  const report = await buildDailySalesReport(company.id, reportDate);

  console.log(
    JSON.stringify({
      company: company.name,
      reportDate,
      phone,
      dayValue: Math.round(report.dayValue),
      dayCount: report.dayCount,
      mtdValue: Math.round(report.mtdValue),
      mtdCount: report.mtdCount,
    }),
  );
  console.log("--- message ---");
  console.log(report.messageBody);
  console.log("---------------");

  const result = await sendSms(company.id, phone, report.messageBody);
  console.log(JSON.stringify({ sent: result.success, error: result.success ? null : result.message }));

  if (!result.success) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

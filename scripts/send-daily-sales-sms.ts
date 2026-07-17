/**
 * One-off Daily Sales SMS send.
 *
 *   node scripts/with-env.mjs vault npx tsx scripts/send-daily-sales-sms.ts 2026-07-14
 */
import {
  getDailySalesSmsConfig,
  normalizeRecipientList,
  runDailySalesSmsForCompany,
} from "../lib/daily-sales-sms";
import { prisma } from "../lib/prisma";

const reportDate = (process.argv[2] ?? "").trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
  console.error("Usage: npx tsx scripts/send-daily-sales-sms.ts YYYY-MM-DD");
  process.exit(1);
}

async function main() {
  const configs = await prisma.dailySalesSmsConfig.findMany({
    select: { companyId: true, recipients: true, enabled: true },
  });

  if (configs.length === 0) {
    console.error("No DailySalesSmsConfig rows found.");
    process.exit(1);
  }

  console.log(JSON.stringify({ reportDate, companies: configs.length }));

  for (const row of configs) {
    const recipients = normalizeRecipientList(row.recipients);
    const before = await getDailySalesSmsConfig(row.companyId);
    const result = await runDailySalesSmsForCompany({
      companyId: row.companyId,
      reportDate,
      source: "manual",
      force: true,
    });
    console.log(
      JSON.stringify({
        companyId: row.companyId,
        enabled: before?.enabled ?? false,
        recipientCount: recipients.length,
        status: result.status,
        errorSummary: result.errorSummary ?? null,
        dayValue: result.report?.dayValue ?? null,
        dayCount: result.report?.dayCount ?? null,
      }),
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

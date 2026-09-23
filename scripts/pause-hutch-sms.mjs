/**
 * Pause / resume Cosmo Hutch SMS by rewriting SmsPortalConfig auth/sms URLs.
 * Live prod picks this up immediately (no redeploy). sendSms refuses hosts
 * containing "hutch-sms-paused" without calling Hutch.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/pause-hutch-sms.mjs
 *   node scripts/with-env.mjs cosmo-prod node scripts/pause-hutch-sms.mjs --resume
 *   node scripts/with-env.mjs cosmo-dev node scripts/pause-hutch-sms.mjs
 */
import { PrismaClient } from "@prisma/client";

const RESUME = process.argv.includes("--resume");
const LIVE_AUTH = "https://bsms.hutch.lk/api/login";
const LIVE_SMS = "https://bsms.hutch.lk/api/sendsms";
const PAUSED_AUTH = "https://hutch-sms-paused.invalid/api/login";
const PAUSED_SMS = "https://hutch-sms-paused.invalid/api/sendsms";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.smsPortalConfig.findMany({
    select: { id: true, companyId: true, username: true, authUrl: true, smsUrl: true },
  });
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const names = new Map(companies.map((c) => [c.id, c.name]));

  if (!rows.length) {
    console.log("No SmsPortalConfig rows.");
    return;
  }

  for (const row of rows) {
    const label = names.get(row.companyId) ?? row.companyId;
    const nextAuth = RESUME ? LIVE_AUTH : PAUSED_AUTH;
    const nextSms = RESUME ? LIVE_SMS : PAUSED_SMS;
    if (row.authUrl === nextAuth && row.smsUrl === nextSms) {
      console.log(`${RESUME ? "RESUME" : "PAUSE"} skip ${label} (${row.username}) — already set`);
      continue;
    }
    await prisma.smsPortalConfig.update({
      where: { id: row.id },
      data: { authUrl: nextAuth, smsUrl: nextSms },
    });
    console.log(
      `${RESUME ? "RESUME" : "PAUSE"} ${label} (${row.username})`,
      `\n  auth: ${row.authUrl} -> ${nextAuth}`,
      `\n  sms:  ${row.smsUrl} -> ${nextSms}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

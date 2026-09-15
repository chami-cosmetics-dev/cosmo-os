/**
 * Build + send call-center daily performance email (Day + MTD + shop/online).
 *
 * Default asOf = yesterday Asia/Colombo.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/send-call-center-weekly-email.ts
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/send-call-center-weekly-email.ts 2026-09-14
 *
 * Loads `.env.cosmo-prod` for DB, then overlays MAILEROO_* from `.env.maileroo.tmp`
 * when present (Vercel env pull).
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
  const { getPreviousColomboReportDate, runCallCenterPerformanceEmail } =
    await import("../lib/call-center-weekly-email");

  const dateArg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const asOf = dateArg ?? getPreviousColomboReportDate();

  if (!process.env.MAILEROO_API_KEY || !process.env.MAILEROO_FROM_EMAIL) {
    console.error("Missing MAILEROO_API_KEY / MAILEROO_FROM_EMAIL");
    process.exit(1);
  }

  const result = await runCallCenterPerformanceEmail({
    mode: "daily",
    asOfYmd: asOf,
    source: "manual",
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "sent") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Build + send (or preview) loyalty eligible weekly admin email.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/send-loyalty-eligible-weekly-email.ts
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/send-loyalty-eligible-weekly-email.ts --preview
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/send-loyalty-eligible-weekly-email.ts 2026-09-16
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
  const { runLoyaltyEligibleWeeklyEmail } = await import(
    "../lib/loyalty-eligible-weekly-email"
  );
  const { formatAppIsoDate } = await import("../lib/format-datetime");

  const args = process.argv.slice(2);
  const preview = args.includes("--preview");
  const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const asOf = dateArg ?? formatAppIsoDate(new Date());

  if (!preview && (!process.env.MAILEROO_API_KEY || !process.env.MAILEROO_FROM_EMAIL)) {
    console.error("Missing MAILEROO_API_KEY / MAILEROO_FROM_EMAIL (or use --preview)");
    process.exit(1);
  }

  const result = await runLoyaltyEligibleWeeklyEmail({
    asOfYmd: asOf,
    preview,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

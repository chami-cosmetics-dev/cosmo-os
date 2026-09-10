/**
 * Copy the current Hutch SmsPortalConfig password from Cosmo prod into the cosmo-dev DB.
 *
 * Why: dev held the pre-2026-09-07 password for the SAME Hutch account
 * (Sales@cosmetics.lk). A wrong password there means failed /api/login calls against the
 * live account, and failed-login volume is what gets that account blocked.
 *
 * Reads prod read-only, writes only the dev row. Never prints the secret.
 *
 * Usage:
 *   node scripts/sync-dev-sms-portal-password.mjs           # dry run
 *   node scripts/sync-dev-sms-portal-password.mjs --apply
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const USERNAME = "Sales@cosmetics.lk";
const fp = (s) => createHash("md5").update(String(s ?? "")).digest("hex").slice(0, 10);
const urlFor = (file) => {
  const url = parse(readFileSync(file)).DATABASE_URL;
  if (!url) throw new Error(`No DATABASE_URL in ${file}`);
  return url;
};

const prod = new PrismaClient({ datasources: { db: { url: urlFor(".env.cosmo-prod") } } });
const dev = new PrismaClient({ datasources: { db: { url: urlFor(".env.cosmo-dev") } } });

try {
  const source = await prod.smsPortalConfig.findFirst({
    where: { username: USERNAME },
    select: { password: true, smsMask: true, authUrl: true, smsUrl: true, campaignName: true, updatedAt: true },
  });
  if (!source) throw new Error(`No prod SmsPortalConfig for ${USERNAME}`);

  const target = await dev.smsPortalConfig.findFirst({
    where: { username: USERNAME },
    select: { id: true, password: true, smsMask: true, updatedAt: true, companyId: true },
  });
  if (!target) throw new Error(`No dev SmsPortalConfig for ${USERNAME} — nothing to sync`);

  console.log(`prod  fp=${fp(source.password)} len=${source.password.length}  mask=${source.smsMask}  saved=${source.updatedAt.toISOString()}`);
  console.log(`dev   fp=${fp(target.password)} len=${target.password.length}  mask=${target.smsMask}  saved=${target.updatedAt.toISOString()}`);

  if (fp(source.password) === fp(target.password)) {
    console.log("\nAlready in sync — nothing to do.");
  } else if (!APPLY) {
    console.log("\nDRY RUN — dev password differs from prod. Re-run with --apply to sync it.");
  } else {
    await dev.smsPortalConfig.update({
      where: { id: target.id },
      data: { password: source.password },
    });
    const after = await dev.smsPortalConfig.findUnique({
      where: { id: target.id },
      select: { password: true, updatedAt: true },
    });
    console.log(`\ndev updated -> fp=${fp(after.password)} len=${after.password.length}  updatedAt=${after.updatedAt.toISOString()}`);
    console.log(fp(after.password) === fp(source.password) ? "VERIFIED: dev now matches prod." : "MISMATCH after write — investigate.");
  }
} finally {
  await prod.$disconnect();
  await dev.$disconnect();
}

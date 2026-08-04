/**
 * Refresh ContactMaster.name from each contact's latest Cosmo order
 * (phone-first order lookup; shipping/billing/ERP customer_name).
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod npx --yes tsx scripts/refresh-contact-names-from-orders.ts --company-id <id> --dry-run
 *   node scripts/with-env.mjs cosmo-prod npx --yes tsx scripts/refresh-contact-names-from-orders.ts --company-id <id>
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { PrismaClient } from "@prisma/client";

import { isSharedMerchantEmail } from "../lib/adapt-import/shared-emails";
import { buildPhoneLookupVariants } from "../lib/phone-lookup";
import { isValidCustomerDisplayName, resolveOrderCustomerName } from "../lib/reports/csv";
import { LIMITS } from "../lib/validation";

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function normalizeName(value: string | null | undefined) {
  const t = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!t || !isValidCustomerDisplayName(t)) return null;
  // Collapse duplicated "Name Name" patterns
  const parts = t.split(" ");
  if (parts.length >= 4 && parts.length % 2 === 0) {
    const half = parts.length / 2;
    const a = parts.slice(0, half).join(" ");
    const b = parts.slice(half).join(" ");
    if (a.toLowerCase() === b.toLowerCase()) return a.slice(0, LIMITS.name.max);
  }
  return t.slice(0, LIMITS.name.max);
}

function namesEqual(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const companyId = typeof args["company-id"] === "string" ? args["company-id"] : null;
  const dryRun = Boolean(args["dry-run"]);
  const limit =
    typeof args.limit === "string" && args.limit ? Number(args.limit) : null;
  const reportPath =
    typeof args.report === "string" ? args.report : "./data/refresh-contact-names-report.json";

  if (!companyId) {
    console.error(
      "Usage: npx tsx scripts/refresh-contact-names-from-orders.ts --company-id <cuid> [--dry-run] [--limit N] [--report path]"
    );
    process.exit(1);
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  const samples: Array<Record<string, string | null>> = [];
  let scanned = 0;
  let withOrder = 0;
  let wouldUpdate = 0;
  let updated = 0;
  let skippedNoName = 0;

  try {
    const contacts = await prisma.contactMaster.findMany({
      where: { companyId },
      select: { id: true, name: true, email: true, phoneNumber: true },
      orderBy: { updatedAt: "desc" },
      ...(limit ? { take: limit } : {}),
    });

    for (const contact of contacts) {
      scanned += 1;
      const phoneVariants = contact.phoneNumber
        ? buildPhoneLookupVariants(contact.phoneNumber)
        : [];
      const email =
        contact.email && !isSharedMerchantEmail(contact.email)
          ? contact.email.trim().toLowerCase()
          : null;

      // Phone-first Cosmo order; also match ERP customer id (= phone) used on ERP-synced orders.
      const order =
        phoneVariants.length > 0
          ? await prisma.order.findFirst({
              where: {
                companyId,
                OR: [
                  { customerPhone: { in: phoneVariants } },
                  { erpnextCustomerId: { in: phoneVariants } },
                ],
              },
              orderBy: { createdAt: "desc" },
              select: {
                shippingAddress: true,
                billingAddress: true,
                rawPayload: true,
                orderNumber: true,
              },
            })
          : email
            ? await prisma.order.findFirst({
                where: {
                  companyId,
                  customerEmail: { equals: email, mode: "insensitive" },
                },
                orderBy: { createdAt: "desc" },
                select: {
                  shippingAddress: true,
                  billingAddress: true,
                  rawPayload: true,
                  orderNumber: true,
                },
              })
            : null;

      if (!order) continue;
      withOrder += 1;

      const nextName = normalizeName(resolveOrderCustomerName(order));
      if (!nextName) {
        skippedNoName += 1;
        continue;
      }
      if (namesEqual(contact.name, nextName)) continue;

      wouldUpdate += 1;
      if (samples.length < 30) {
        samples.push({
          id: contact.id,
          phone: contact.phoneNumber,
          from: contact.name,
          to: nextName,
          orderNumber: order.orderNumber,
        });
      }

      if (dryRun) continue;

      await prisma.contactMaster.update({
        where: { id: contact.id },
        data: { name: nextName },
      });
      updated += 1;
    }

    const report = {
      companyId,
      dryRun,
      scanned,
      withOrder,
      wouldUpdate,
      updated,
      skippedNoName,
      samples,
    };
    console.log(JSON.stringify(report, null, 2));
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`[refresh-names] wrote ${reportPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[refresh-names] fatal", error);
  process.exit(1);
});

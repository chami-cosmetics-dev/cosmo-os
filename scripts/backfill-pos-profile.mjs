// Backfill posProfile and erpnextWarehouse for existing POS orders that were created before
// pos_profile was captured. Fetches pos_profile and warehouse from the Sales Invoice via ERPNext API.
//
// Usage: node scripts/backfill-pos-profile.mjs [--dry-run] [--limit=100]

import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const prisma = new PrismaClient({ datasources: { db: { url: directUrl } } });

const isDryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : 500;

async function fetchPosDetails(invoiceName, baseUrl, apiKey, apiSecret) {
  const fields = encodeURIComponent(JSON.stringify(["pos_profile", "items.warehouse"]));
  const res = await fetch(
    `${baseUrl}/api/resource/Sales Invoice/${encodeURIComponent(invoiceName)}?fields=${fields}`,
    { headers: { Authorization: `token ${apiKey}:${apiSecret}` } },
  );
  if (!res.ok) return null;
  const json = await res.json();
  const posProfile = json?.data?.pos_profile?.trim() || null;
  const warehouse = json?.data?.items?.[0]?.warehouse?.trim() || null;
  return { posProfile, warehouse };
}

async function main() {
  console.log(`[backfill-pos-profile] dry-run=${isDryRun}, limit=${LIMIT}`);

  const orders = await prisma.order.findMany({
    where: {
      sourceName: "erpnext-pos",
      posProfile: null,
    },
    select: {
      id: true,
      name: true,
      erpnextInvoiceId: true,
      companyLocation: {
        select: {
          erpnextInstance: {
            select: { baseUrl: true, apiKey: true, apiSecret: true },
          },
        },
      },
    },
    take: LIMIT,
  });

  console.log(`[backfill-pos-profile] Found ${orders.length} POS orders missing posProfile`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const order of orders) {
    const invoiceName = order.erpnextInvoiceId ?? order.name;
    if (!invoiceName) { skipped++; continue; }

    const instance = order.companyLocation?.erpnextInstance;
    if (!instance?.baseUrl || !instance?.apiKey || !instance?.apiSecret) {
      console.warn(`  [${order.name}] No ERP instance credentials — skipping`);
      skipped++;
      continue;
    }

    let details;
    try {
      details = await fetchPosDetails(
        invoiceName,
        instance.baseUrl.replace(/\/$/, ""),
        instance.apiKey,
        instance.apiSecret,
      );
    } catch (err) {
      console.error(`  [${order.name}] API fetch failed: ${err.message}`);
      failed++;
      continue;
    }

    if (!details?.posProfile) {
      console.warn(`  [${order.name}] pos_profile not found in ERP — skipping`);
      skipped++;
      continue;
    }

    console.log(`  [${order.name}] posProfile="${details.posProfile}" warehouse="${details.warehouse ?? "—"}"`);

    if (!isDryRun) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          posProfile: details.posProfile,
          ...(details.warehouse ? { erpnextWarehouse: details.warehouse } : {}),
        },
      });
    }
    updated++;
  }

  console.log(
    `\n[backfill-pos-profile] Done — updated=${updated}, skipped=${skipped}, failed=${failed}` +
    (isDryRun ? " (dry-run, no writes)" : ""),
  );
}

main().catch(console.error).finally(() => prisma.$disconnect());

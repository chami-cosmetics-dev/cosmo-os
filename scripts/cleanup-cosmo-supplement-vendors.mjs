/**
 * Remove Cosmo OS ProductItems whose vendor matches Vault OS catalog vendors.
 * Skips items linked to OrderLineItem or SampleFreeIssueItem.
 *
 * Usage:
 *   # 1) Export vendor names from Vault
 *   node scripts/with-env.mjs vault node scripts/cleanup-cosmo-supplement-vendors.mjs --export-vendors
 *
 *   # 2) Dry-run on Cosmo
 *   node scripts/with-env.mjs cosmo-dev node scripts/cleanup-cosmo-supplement-vendors.mjs
 *   node scripts/with-env.mjs cosmo-prod node scripts/cleanup-cosmo-supplement-vendors.mjs
 *
 *   # 3) Apply
 *   node scripts/with-env.mjs cosmo-dev node scripts/cleanup-cosmo-supplement-vendors.mjs --apply
 *   node scripts/with-env.mjs cosmo-prod node scripts/cleanup-cosmo-supplement-vendors.mjs --apply
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const VENDORS_PATH = resolve(process.cwd(), "scripts/_vault-vendors.json");
const apply = process.argv.includes("--apply");
const exportVendors = process.argv.includes("--export-vendors");
const CHUNK = 200;

const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl || rawUrl } },
});

function normalizeVendor(name) {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

if (exportVendors) {
  const rows = await prisma.productItem.findMany({
    where: { vendorId: { not: null } },
    select: { vendor: { select: { name: true } } },
  });
  const set = new Set();
  for (const row of rows) {
    const key = normalizeVendor(row.vendor?.name);
    if (key) set.add(key);
  }
  const vendors = [...set].sort();
  writeFileSync(VENDORS_PATH, JSON.stringify({ exportedAt: new Date().toISOString(), vendors }, null, 2));
  console.log(`Exported ${vendors.length} vault vendors → ${VENDORS_PATH}`);
  await prisma.$disconnect();
  process.exit(0);
}

if (!existsSync(VENDORS_PATH)) {
  console.error(`Missing ${VENDORS_PATH}. Run --export-vendors against vault first.`);
  process.exit(1);
}

const { vendors: vaultVendors } = JSON.parse(readFileSync(VENDORS_PATH, "utf8"));
const vaultSet = new Set((vaultVendors ?? []).map(normalizeVendor).filter(Boolean));
console.log(`Loaded ${vaultSet.size} vault vendor names`);

const vendors = await prisma.vendor.findMany({
  select: { id: true, name: true },
});
const matchingVendorIds = vendors
  .filter((v) => vaultSet.has(normalizeVendor(v.name)))
  .map((v) => v.id);

console.log(`Matched ${matchingVendorIds.length} Cosmo vendors to Vault brand list`);
if (matchingVendorIds.length === 0) {
  console.log("Nothing to delete.");
  await prisma.$disconnect();
  process.exit(0);
}

const candidates = await prisma.productItem.findMany({
  where: { vendorId: { in: matchingVendorIds } },
  select: {
    id: true,
    sku: true,
    productTitle: true,
    vendor: { select: { name: true } },
    companyLocation: { select: { name: true } },
    _count: { select: { orderLineItems: true, sampleFreeIssueItems: true } },
  },
});

const toDelete = [];
const skippedOrdered = [];
const skippedSample = [];
const byVendor = new Map();

for (const item of candidates) {
  if (item._count.orderLineItems > 0) {
    skippedOrdered.push(item);
    continue;
  }
  if (item._count.sampleFreeIssueItems > 0) {
    skippedSample.push(item);
    continue;
  }
  toDelete.push(item);
  const vn = item.vendor?.name ?? "(none)";
  byVendor.set(vn, (byVendor.get(vn) ?? 0) + 1);
}

console.log(
  JSON.stringify(
    {
      candidates: candidates.length,
      toDelete: toDelete.length,
      skippedOrdered: skippedOrdered.length,
      skippedSample: skippedSample.length,
      byVendor: [...byVendor.entries()].sort((a, b) => b[1] - a[1]),
      sampleDelete: toDelete.slice(0, 8).map((i) => ({
        sku: i.sku,
        title: i.productTitle,
        vendor: i.vendor?.name,
        loc: i.companyLocation.name,
      })),
    },
    null,
    2,
  ),
);

if (!apply) {
  console.log("\nDry-run only. Re-run with --apply to delete.");
  await prisma.$disconnect();
  process.exit(0);
}

let deleted = 0;
for (let i = 0; i < toDelete.length; i += CHUNK) {
  const chunk = toDelete.slice(i, i + CHUNK).map((x) => x.id);
  const result = await prisma.productItem.deleteMany({ where: { id: { in: chunk } } });
  deleted += result.count;
  console.log(`Deleted ${deleted}/${toDelete.length}`);
}

console.log(`Done. Deleted ${deleted} ProductItems. Skipped ordered=${skippedOrdered.length}, sample=${skippedSample.length}.`);
await prisma.$disconnect();

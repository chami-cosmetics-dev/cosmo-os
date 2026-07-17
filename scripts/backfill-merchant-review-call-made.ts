/**
 * One-time backfill: set callMade=true on MerchantOrderReview rows that are
 * already follow_up but still have callMade=false (copied before that field
 * was included in the bulk mark-follow-up action).
 *
 * Usage (uses active .env — npm run env:use <target> first; ask before prod):
 *   npx tsx scripts/backfill-merchant-review-call-made.ts --dry-run
 *   npx tsx scripts/backfill-merchant-review-call-made.ts
 *   npx tsx scripts/backfill-merchant-review-call-made.ts --since=2026-07-16
 *   npx tsx scripts/backfill-merchant-review-call-made.ts --companyId=clxxxxxxxx
 */

import { prisma } from "../lib/prisma";

function argValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sinceRaw = argValue("--since=");
  const companyId = argValue("--companyId=");

  const where: {
    reviewStatus: string;
    callMade: boolean;
    companyId?: string;
    updatedAt?: { gte: Date };
  } = {
    reviewStatus: "follow_up",
    callMade: false,
  };

  if (companyId) {
    where.companyId = companyId;
  }

  if (sinceRaw) {
    const since = new Date(`${sinceRaw}T00:00:00.000+05:30`);
    if (Number.isNaN(since.getTime())) {
      throw new Error(`Invalid --since date: ${sinceRaw} (use YYYY-MM-DD)`);
    }
    where.updatedAt = { gte: since };
  }

  console.log(
    `[backfill-merchant-review-call-made] dry-run=${dryRun}` +
      (sinceRaw ? ` since=${sinceRaw}` : "") +
      (companyId ? ` companyId=${companyId}` : "")
  );

  const matches = await prisma.merchantOrderReview.findMany({
    where,
    select: {
      id: true,
      orderId: true,
      companyId: true,
      updatedAt: true,
      order: { select: { orderNumber: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  console.log(`Found ${matches.length} follow_up review(s) with callMade=false`);

  if (matches.length === 0) {
    return;
  }

  if (dryRun) {
    for (const row of matches.slice(0, 20)) {
      const label = row.order.orderNumber ?? row.order.name ?? row.orderId;
      console.log(`  [dry-run] ${label} (updated ${row.updatedAt.toISOString()})`);
    }
    if (matches.length > 20) {
      console.log(`  … and ${matches.length - 20} more`);
    }
    console.log(`Would update ${matches.length} review(s)`);
    return;
  }

  const result = await prisma.merchantOrderReview.updateMany({
    where: {
      id: { in: matches.map((row) => row.id) },
      reviewStatus: "follow_up",
      callMade: false,
    },
    data: { callMade: true },
  });

  console.log(`Updated ${result.count} review(s) to callMade=true`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

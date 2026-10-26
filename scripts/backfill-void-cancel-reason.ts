/**
 * Fill empty Order.cancelReason on voided orders from return cancel remark,
 * return remark, finance cancel note, Shopify payload, then "ERP credit note"
 * for returned-stage voids. Leaves rows with no source untouched.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod npx tsx scripts/backfill-void-cancel-reason.ts
 *   node scripts/with-env.mjs cosmo-prod npx tsx scripts/backfill-void-cancel-reason.ts --apply
 */

import { PrismaClient } from "@prisma/client";

import {
  resolveCancelReasonBackfill,
  shopifyCancelReasonFromPayload,
  type CancelReasonBackfillSource,
} from "../lib/order-cancel-reason";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();
const REASON_MAX = 5000;

function approvalNote(
  rows: Array<{ requestNote: string | null; reviewNote: string | null }>,
): string {
  for (const row of rows) {
    const note = row.requestNote?.trim() || row.reviewNote?.trim();
    if (note) return note;
  }
  return "";
}

async function main() {
  const missing = await prisma.order.findMany({
    where: {
      financialStatus: { equals: "voided", mode: "insensitive" },
      OR: [{ cancelReason: null }, { cancelReason: "" }],
    },
    select: {
      id: true,
      name: true,
      sourceName: true,
      fulfillmentStage: true,
      rawPayload: true,
      returns: {
        orderBy: { returnDate: "desc" },
        take: 1,
        select: { cancelRemark: true, returnRemark: true },
      },
      approvalRequests: {
        where: { type: { in: ["order_cancel_approval", "return_cancel"] } },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { requestNote: true, reviewNote: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const bySource: Record<CancelReasonBackfillSource, number> = {
    order: 0,
    return_cancel: 0,
    return_remark: 0,
    approval: 0,
    shopify: 0,
    erp_credit_note: 0,
  };
  let skipped = 0;
  let written = 0;
  const samples: Array<{ name: string | null; source: CancelReasonBackfillSource; reason: string }> = [];

  for (const order of missing) {
    const hit = resolveCancelReasonBackfill({
      returnCancelRemark: order.returns[0]?.cancelRemark,
      returnRemark: order.returns[0]?.returnRemark,
      approvalNote: approvalNote(order.approvalRequests),
      shopifyCancelReason: shopifyCancelReasonFromPayload(order.rawPayload),
      fulfillmentStage: order.fulfillmentStage,
    });
    if (!hit) {
      skipped += 1;
      continue;
    }
    bySource[hit.source] += 1;
    const reason = hit.reason.slice(0, REASON_MAX);
    if (samples.length < 12) {
      samples.push({ name: order.name, source: hit.source, reason });
    }
    if (!apply) continue;
    const result = await prisma.order.updateMany({
      where: {
        id: order.id,
        OR: [{ cancelReason: null }, { cancelReason: "" }],
      },
      data: { cancelReason: reason },
    });
    written += result.count;
  }

  const recoverable = Object.values(bySource).reduce((sum, n) => sum + n, 0);
  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        scanned: missing.length,
        recoverable,
        skipped,
        written: apply ? written : 0,
        bySource,
        samples,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

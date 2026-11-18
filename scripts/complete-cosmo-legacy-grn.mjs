/**
 * Close GRN work handled in the manual book before 15 September 2026.
 *
 * Preview: node scripts/with-env.mjs cosmo-prod node scripts/complete-cosmo-legacy-grn.mjs --target=cosmo-prod
 * Apply:   node scripts/with-env.mjs cosmo-prod node scripts/complete-cosmo-legacy-grn.mjs --target=cosmo-prod --apply
 *
 * This script intentionally refuses Vault and any unrecognised environment.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

const target = process.argv.find((arg) => arg.startsWith("--target="))?.slice(9);
const apply = process.argv.includes("--apply");
const cutoff = new Date("2026-09-15T00:00:00.000Z");
const completedAt = new Date("2026-09-14T23:59:59.000Z");

if (target !== "cosmo-dev" && target !== "cosmo-prod") {
  throw new Error("Pass --target=cosmo-dev or --target=cosmo-prod; Vault is not permitted.");
}
if (process.env.NEXT_PUBLIC_APP_NAME?.toLowerCase().includes("vault")) {
  throw new Error("Refusing to modify a Vault deployment.");
}
const targetEnv = parse(readFileSync(resolve(`.env.${target}`)));
if (!targetEnv.DATABASE_URL || process.env.DATABASE_URL !== targetEnv.DATABASE_URL) {
  throw new Error("DATABASE_URL does not match the named Cosmo environment.");
}

const prisma = new PrismaClient();
const where = {
  deletedAt: null,
  docstatus: 1,
  OR: [
    { creation: { lt: cutoff } },
    { creation: null, postingDate: { lt: cutoff } },
  ],
};
const select = {
  companyId: true,
  name: true,
  handoverAt: true,
  handoverReceivedAt: true,
  valuedAt: true,
  valuationConfirmedAt: true,
  receivedAt: true,
};

// The target is validated before these fixed SQL statements are constructed.
// Keep this batch atomic: an interrupted run must never leave half a workflow closed.
function stageUpdate(table) {
  return prisma.$executeRawUnsafe(`
    UPDATE "${table}" SET
      "handoverAt" = COALESCE("handoverAt", $1),
      "handoverReceivedAt" = COALESCE("handoverReceivedAt", $1),
      "valuedAt" = COALESCE("valuedAt", $1),
      "valuationConfirmedAt" = COALESCE("valuationConfirmedAt", $1),
      "receivedAt" = COALESCE("receivedAt", $1),
      "notReceivedAt" = NULL,
      "notReceivedById" = NULL,
      "valuationRejectedAt" = NULL,
      "valuationRejectedById" = NULL,
      "updatedAt" = NOW()
    WHERE "deletedAt" IS NULL AND "docstatus" = 1
      AND ("creation" < $2 OR ("creation" IS NULL AND "postingDate" < $2))
      AND ("handoverAt" IS NULL OR "handoverReceivedAt" IS NULL OR "valuedAt" IS NULL
        OR "valuationConfirmedAt" IS NULL OR "receivedAt" IS NULL OR "notReceivedAt" IS NOT NULL
        OR "valuationRejectedAt" IS NOT NULL)
  `, completedAt, cutoff);
}

const eligibleReceipts = `
  SELECT "companyId", "name", FALSE AS "isBackfill", "id" FROM "GrnPurchaseReceipt"
  WHERE "deletedAt" IS NULL AND "docstatus" = 1
    AND ("creation" < $1 OR ("creation" IS NULL AND "postingDate" < $1))
  UNION ALL
  SELECT "companyId", "name", TRUE AS "isBackfill", "id" FROM "GrnBackfillPurchaseReceipt"
  WHERE "deletedAt" IS NULL AND "docstatus" = 1
    AND ("creation" < $1 OR ("creation" IS NULL AND "postingDate" < $1))
`;

function insertMarginApprovals() {
  return prisma.$executeRawUnsafe(`
    WITH eligible AS (${eligibleReceipts}), items AS (
      SELECT e."companyId", e."name", e."isBackfill", i."itemCode"
      FROM eligible e JOIN "GrnPurchaseReceiptItem" i ON NOT e."isBackfill" AND i."purchaseReceiptId" = e."id"
      UNION
      SELECT e."companyId", e."name", e."isBackfill", i."itemCode"
      FROM eligible e JOIN "GrnBackfillPurchaseReceiptItem" i ON e."isBackfill" AND i."purchaseReceiptId" = e."id"
    )
    INSERT INTO "GrnMarginApproval" ("id", "companyId", "purchaseReceiptName", "purchaseReceiptIsBackfill", "itemCode", "approvedAt", "createdAt", "updatedAt")
    SELECT md5(random()::text || clock_timestamp()::text), "companyId", "name", "isBackfill", "itemCode", $2, NOW(), NOW()
    FROM items WHERE "itemCode" IS NOT NULL AND "itemCode" <> ''
    ON CONFLICT ("companyId", "purchaseReceiptName", "purchaseReceiptIsBackfill", "itemCode") DO NOTHING
  `, cutoff, completedAt);
}

function upsertPaymentApprovals() {
  return prisma.$executeRawUnsafe(`
    WITH eligible AS (${eligibleReceipts})
    INSERT INTO "GrnPaymentApproval" ("id", "companyId", "purchaseReceiptName", "purchaseReceiptIsBackfill", "approvedAt", "paidAt", "createdAt", "updatedAt")
    SELECT md5(random()::text || clock_timestamp()::text), "companyId", "name", "isBackfill", $2, $2, NOW(), NOW() FROM eligible
    ON CONFLICT ("companyId", "purchaseReceiptName", "purchaseReceiptIsBackfill") DO UPDATE
      SET "paidAt" = COALESCE("GrnPaymentApproval"."paidAt", EXCLUDED."paidAt"), "updatedAt" = NOW()
      WHERE "GrnPaymentApproval"."paidAt" IS NULL
  `, cutoff, completedAt);
}

try {
  const [live, backfill] = await Promise.all([
    prisma.grnPurchaseReceipt.findMany({ where, select }),
    prisma.grnBackfillPurchaseReceipt.findMany({ where, select }),
  ]);
  const pending = (rows) => rows.filter((row) => !row.handoverAt || !row.handoverReceivedAt || !row.valuedAt || !row.valuationConfirmedAt || !row.receivedAt).length;
  console.log(JSON.stringify({ target, cutoff: "before 2026-09-15", apply, live: live.length, backfill: backfill.length, liveMissingStages: pending(live), backfillMissingStages: pending(backfill) }));
  if (apply) {
    const result = await prisma.$transaction([
      stageUpdate("GrnPurchaseReceipt"),
      stageUpdate("GrnBackfillPurchaseReceipt"),
      insertMarginApprovals(),
      upsertPaymentApprovals(),
    ]);
    console.log(JSON.stringify({ stageUpdatesLive: result[0], stageUpdatesBackfill: result[1], insertedMarginApprovals: result[2], insertedOrPaidPayments: result[3] }));
  }
  const [verification] = await prisma.$queryRawUnsafe(`
    WITH eligible AS (${eligibleReceipts}), items AS (
      SELECT e."companyId", e."name", e."isBackfill", i."itemCode"
      FROM eligible e JOIN "GrnPurchaseReceiptItem" i ON NOT e."isBackfill" AND i."purchaseReceiptId" = e."id"
      UNION
      SELECT e."companyId", e."name", e."isBackfill", i."itemCode"
      FROM eligible e JOIN "GrnBackfillPurchaseReceiptItem" i ON e."isBackfill" AND i."purchaseReceiptId" = e."id"
    )
    SELECT
      (SELECT COUNT(*) FROM eligible e LEFT JOIN "GrnPaymentApproval" p
        ON p."companyId" = e."companyId" AND p."purchaseReceiptName" = e."name"
        AND p."purchaseReceiptIsBackfill" = e."isBackfill"
        WHERE p."approvedAt" IS NULL OR p."paidAt" IS NULL) AS "pendingPayments",
      (SELECT COUNT(*) FROM items i LEFT JOIN "GrnMarginApproval" m
        ON m."companyId" = i."companyId" AND m."purchaseReceiptName" = i."name"
        AND m."purchaseReceiptIsBackfill" = i."isBackfill" AND m."itemCode" = i."itemCode"
        WHERE i."itemCode" IS NOT NULL AND i."itemCode" <> '' AND m."approvedAt" IS NULL) AS "pendingMargins"
  `, cutoff);
  const [verifiedLive, verifiedBackfill] = apply
    ? await Promise.all([
        prisma.grnPurchaseReceipt.findMany({ where, select }),
        prisma.grnBackfillPurchaseReceipt.findMany({ where, select }),
      ])
    : [live, backfill];
  console.log(JSON.stringify({ verification: { liveMissingStages: pending(verifiedLive), backfillMissingStages: pending(verifiedBackfill), pendingMargins: Number(verification.pendingMargins), pendingPayments: Number(verification.pendingPayments) } }));
} finally {
  await prisma.$disconnect();
}

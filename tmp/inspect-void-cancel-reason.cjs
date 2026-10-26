const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function trim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function payloadCancelReason(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  const top = raw;
  const data = top.data && typeof top.data === "object" && !Array.isArray(top.data) ? top.data : null;
  for (const candidate of [top.cancel_reason, top.cancelReason, data?.cancel_reason, data?.cancelReason]) {
    const value = trim(candidate);
    if (value) return value.slice(0, 120);
  }
  return "";
}

function jsonReason(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const reason = value.cancelReason ?? value.reason ?? value.cancel_reason;
  return trim(reason).slice(0, 120);
}

async function main() {
  const last90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const totals = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS voided,
      COUNT(*) FILTER (
        WHERE "cancelReason" IS NOT NULL AND btrim("cancelReason") <> ''
      )::int AS with_reason,
      COUNT(*) FILTER (
        WHERE "cancelReason" IS NULL OR btrim("cancelReason") = ''
      )::int AS missing_reason,
      COUNT(*) FILTER (
        WHERE "createdAt" >= ${last90}
      )::int AS voided_last90,
      COUNT(*) FILTER (
        WHERE "createdAt" >= ${last90}
          AND ("cancelReason" IS NULL OR btrim("cancelReason") = '')
      )::int AS missing_last90
    FROM "Order"
    WHERE lower(coalesce("financialStatus", '')) = 'voided'
  `;

  const bySource = await prisma.$queryRaw`
    SELECT
      "sourceName" AS source,
      COUNT(*)::int AS voided,
      COUNT(*) FILTER (
        WHERE "cancelReason" IS NULL OR btrim("cancelReason") = ''
      )::int AS missing
    FROM "Order"
    WHERE lower(coalesce("financialStatus", '')) = 'voided'
    GROUP BY "sourceName"
    ORDER BY COUNT(*) DESC
  `;

  const topReasons = await prisma.$queryRaw`
    SELECT btrim("cancelReason") AS reason, COUNT(*)::int AS n
    FROM "Order"
    WHERE lower(coalesce("financialStatus", '')) = 'voided'
      AND "cancelReason" IS NOT NULL
      AND btrim("cancelReason") <> ''
    GROUP BY btrim("cancelReason")
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `;

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
      cancelledAt: true,
      createdAt: true,
      rawPayload: true,
      returns: {
        select: { cancelRemark: true, returnRemark: true, actionRemark: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      approvalRequests: {
        where: {
          type: { in: ["order_cancel_approval", "return_cancel_approval"] },
        },
        select: { type: true, status: true, requestNote: true, reviewNote: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 8000,
  });

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      action: { in: ["order_cancelled", "order_cancel_approved", "returned_order_cancel_approved"] },
      entityId: { in: missing.map((order) => order.id) },
    },
    select: { entityId: true, action: true, afterData: true, summary: true },
  });
  const auditByOrder = new Map();
  for (const log of auditLogs) {
    if (!log.entityId || auditByOrder.has(log.entityId)) continue;
    auditByOrder.set(log.entityId, log);
  }

  const recover = {
    audit: 0,
    approval: 0,
    returnRemark: 0,
    shopifyPayload: 0,
    returnedStage: 0,
    cancelledStamp: 0,
    none: 0,
  };
  const samples = {
    audit: [],
    approval: [],
    returnRemark: [],
    shopifyPayload: [],
    returnedStage: [],
    cancelledStamp: [],
    none: [],
  };

  for (const order of missing) {
    const audit = auditByOrder.get(order.id);
    const auditReason = jsonReason(audit?.afterData) || trim(audit?.summary);
    const approval = order.approvalRequests.find((row) => trim(row.requestNote) || trim(row.reviewNote));
    const approvalReason = trim(approval?.requestNote) || trim(approval?.reviewNote);
    const ret = order.returns[0];
    const returnReason = trim(ret?.cancelRemark) || trim(ret?.returnRemark) || trim(ret?.actionRemark);
    const shopifyReason = payloadCancelReason(order.rawPayload);

    let bucket = "none";
    if (auditReason) bucket = "audit";
    else if (approvalReason) bucket = "approval";
    else if (returnReason) bucket = "returnRemark";
    else if (shopifyReason) bucket = "shopifyPayload";
    else if (order.fulfillmentStage === "returned") bucket = "returnedStage";
    else if (order.cancelledAt) bucket = "cancelledStamp";

    recover[bucket] += 1;
    if (samples[bucket].length < 8) {
      samples[bucket].push({
        name: order.name,
        source: order.sourceName,
        stage: order.fulfillmentStage,
        createdAt: order.createdAt,
        reason: (auditReason || approvalReason || returnReason || shopifyReason || "").slice(0, 80),
      });
    }
  }

  console.log(JSON.stringify({
    totals: totals[0],
    scannedMissing: missing.length,
    bySource,
    topReasons,
    recoverableAmongScanned: recover,
    samples,
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

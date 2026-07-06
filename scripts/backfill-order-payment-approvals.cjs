/* eslint-disable no-console */
// Backfills ORDER_PAYMENT_APPROVAL records for bank/KOKO/WebXPay orders that
// are stuck in pre-dispatch stages with no pending approval in the DB.
// Safe to run multiple times — skips orders that already have a pending approval.
//
// Usage:
//   node scripts/backfill-order-payment-approvals.cjs
//   node scripts/backfill-order-payment-approvals.cjs --dry-run

const { randomUUID } = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const isDryRun = process.argv.includes("--dry-run");

// Stages where an order is still waiting to be dispatched (i.e. needs pre-dispatch approval)
const PRE_DISPATCH_STAGES = [
  "order_received",
  "sample_free_issue",
  "print",
  "ready_to_dispatch",
];

function requiresApproval(paymentGatewayPrimary, paymentGatewayNames) {
  if (paymentGatewayPrimary) {
    const g = paymentGatewayPrimary.toLowerCase().trim();
    return g.includes("koko") || g.includes("bank") || g.includes("webxpay");
  }
  const names = (paymentGatewayNames ?? []).map((g) => g.toLowerCase().trim()).filter(Boolean);
  return names.some((g) => g.includes("koko") || g.includes("bank") || g.includes("webxpay"));
}

async function getFinanceUsers(companyId) {
  return prisma.$queryRaw`
    SELECT DISTINCT u."id", u."email"
    FROM "User" u
    JOIN "UserRole" ur ON ur."userId" = u."id"
    LEFT JOIN "RolePermission" rp ON rp."roleId" = ur."roleId"
    LEFT JOIN "Permission" p ON p."id" = rp."permissionId"
    WHERE u."companyId" = ${companyId}
      AND p."key" = 'finance.approvals.manage'
  `;
}

async function main() {
  console.log(`[backfill-order-payment-approvals] ${isDryRun ? "DRY RUN — " : ""}starting...`);

  // Find all orders that require pre-dispatch finance approval
  const candidates = await prisma.order.findMany({
    where: {
      fulfillmentStage: { in: PRE_DISPATCH_STAGES },
      financialStatus: { notIn: ["voided", "paid"] },
      // Only orders with bank/koko/webxpay payment
      OR: [
        { paymentGatewayPrimary: { contains: "bank", mode: "insensitive" } },
        { paymentGatewayPrimary: { contains: "koko", mode: "insensitive" } },
        { paymentGatewayPrimary: { contains: "webxpay", mode: "insensitive" } },
        { paymentGatewayNames: { has: "Bank Transfer" } },
        { paymentGatewayNames: { has: "Koko" } },
        { paymentGatewayNames: { has: "WebXPay" } },
      ],
      // Skip orders that already have a pending approval
      approvalRequests: {
        none: { type: "order_payment_approval", status: "pending" },
      },
    },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      companyId: true,
      fulfillmentStage: true,
      financialStatus: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      totalPrice: true,
    },
  });

  console.log(`[backfill] Found ${candidates.length} orders missing payment approval`);

  if (candidates.length === 0) {
    console.log("[backfill] Nothing to do.");
    return;
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const order of candidates) {
    if (!requiresApproval(order.paymentGatewayPrimary, order.paymentGatewayNames)) {
      skipped++;
      continue;
    }

    const invoiceLabel = order.name ?? order.orderNumber ?? order.shopifyOrderId ?? order.id;
    const paymentType = order.paymentGatewayPrimary ?? "Bank Transfer";
    const amount = order.totalPrice?.toString() ?? "0";

    console.log(
      `  [${isDryRun ? "DRY" : "CREATE"}] ${invoiceLabel} | stage=${order.fulfillmentStage} | payment=${paymentType} | amount=${amount}`
    );

    if (isDryRun) {
      created++;
      continue;
    }

    try {
      // Double-check no pending approval exists (race safety)
      const existing = await prisma.$queryRaw`
        SELECT "id" FROM "ApprovalRequest"
        WHERE "companyId" = ${order.companyId}
          AND "type" = 'order_payment_approval'
          AND "orderId" = ${order.id}
          AND "status" = 'pending'
        LIMIT 1
      `;
      if (existing.length > 0) {
        console.log(`    → already has pending approval (${existing[0].id}), skipping`);
        skipped++;
        continue;
      }

      const id = randomUUID();
      const note = `${paymentType} — amount: ${amount} [backfilled]`;
      const now2 = new Date();
      await prisma.$executeRaw`
        INSERT INTO "ApprovalRequest" (
          "id", "companyId", "type", "status", "orderId",
          "requestNote", "createdAt", "updatedAt"
        )
        VALUES (
          ${id}, ${order.companyId}, 'order_payment_approval', 'pending', ${order.id},
          ${note}, ${now2}, ${now2}
        )
        ON CONFLICT DO NOTHING
      `;

      // Notify finance users
      const financeUsers = await getFinanceUsers(order.companyId);
      for (const u of financeUsers) {
        await prisma.$executeRaw`
          INSERT INTO "Notification" (
            "id", "companyId", "userId", "type", "title", "body",
            "entityType", "entityId", "createdAt"
          )
          VALUES (
            ${randomUUID()}, ${order.companyId}, ${u.id},
            'approval_requested',
            'Finance approval required',
            ${`${paymentType} payment approval needed for ${invoiceLabel}.`},
            'ApprovalRequest', ${id},
            ${new Date()}
          )
        `;
      }

      console.log(`    → created approval ${id}, notified ${financeUsers.length} finance user(s)`);
      created++;
    } catch (err) {
      console.error(`    → FAILED for order ${invoiceLabel}:`, err.message);
      failed++;
    }
  }

  console.log(
    `\n[backfill] Done. created=${created} skipped=${skipped} failed=${failed}${isDryRun ? " (dry run — no changes made)" : ""}`
  );
}

main()
  .catch((err) => {
    console.error("[backfill] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

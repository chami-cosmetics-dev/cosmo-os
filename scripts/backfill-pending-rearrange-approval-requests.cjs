/* eslint-disable no-console */
const { randomUUID } = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function getFinanceRecipients(companyId) {
  return prisma.$queryRaw`
    SELECT DISTINCT u."id"
    FROM "User" u
    JOIN "UserRole" ur ON ur."userId" = u."id"
    JOIN "Role" r ON r."id" = ur."roleId"
    LEFT JOIN "RolePermission" rp ON rp."roleId" = ur."roleId"
    LEFT JOIN "Permission" p ON p."id" = rp."permissionId"
    WHERE u."companyId" = ${companyId}
      AND (
        p."key" = 'finance.approvals.manage'
        OR r."name" IN ('admin', 'super_admin')
      )
  `;
}

async function createMissingNotification({ companyId, userId, approvalId, invoiceLabel }) {
  const existing = await prisma.$queryRaw`
    SELECT "id"
    FROM "Notification"
    WHERE "companyId" = ${companyId}
      AND "userId" = ${userId}
      AND "type" = 'approval_requested'
      AND "entityType" = 'ApprovalRequest'
      AND "entityId" = ${approvalId}
    LIMIT 1
  `;
  if (existing.length > 0) return false;

  await prisma.$executeRaw`
    INSERT INTO "Notification" (
      "id",
      "companyId",
      "userId",
      "type",
      "title",
      "body",
      "entityType",
      "entityId",
      "createdAt"
    )
    VALUES (
      ${randomUUID()},
      ${companyId},
      ${userId},
      'approval_requested',
      'Finance approval requested',
      ${`Bank transfer approval requested for ${invoiceLabel}.`},
      'ApprovalRequest',
      ${approvalId},
      ${new Date()}
    )
  `;
  return true;
}

async function main() {
  const returns = await prisma.$queryRaw`
    SELECT
      r."id" AS "orderReturnId",
      r."companyId",
      r."orderId",
      r."actionById",
      r."returnedById",
      r."actionRemark",
      COALESCE(o."name", o."orderNumber", o."shopifyOrderId", r."orderId") AS "invoiceLabel"
    FROM "OrderReturn" r
    JOIN "Order" o ON o."id" = r."orderId"
    WHERE r."actionType" = 'rearrange'
      AND r."actionStatus" = 'pending'
      AND o."financialStatus" = 'pending'
      AND (
        o."paymentGatewayPrimary" = 'bank_transfer'
        OR 'bank_transfer' = ANY(o."paymentGatewayNames")
      )
  `;

  let approvalsCreated = 0;
  let notificationsCreated = 0;

  for (const item of returns) {
    const existing = await prisma.$queryRaw`
      SELECT "id"
      FROM "ApprovalRequest"
      WHERE "companyId" = ${item.companyId}
        AND "type" = 'return_rearrange_payment'
        AND "orderReturnId" = ${item.orderReturnId}
        AND "status" = 'pending'
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;

    let approvalId = existing[0]?.id;
    if (!approvalId) {
      approvalId = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO "ApprovalRequest" (
          "id",
          "companyId",
          "type",
          "status",
          "orderId",
          "orderReturnId",
          "requestedById",
          "requestNote",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${approvalId},
          ${item.companyId},
          'return_rearrange_payment',
          'pending',
          ${item.orderId},
          ${item.orderReturnId},
          ${item.actionById ?? item.returnedById},
          ${item.actionRemark},
          ${new Date()},
          ${new Date()}
        )
      `;
      approvalsCreated += 1;
    }

    const recipients = await getFinanceRecipients(item.companyId);
    for (const recipient of recipients) {
      const created = await createMissingNotification({
        companyId: item.companyId,
        userId: recipient.id,
        approvalId,
        invoiceLabel: item.invoiceLabel,
      });
      if (created) notificationsCreated += 1;
    }
  }

  console.log(
    `Backfill complete. Created ${approvalsCreated} approval request(s) and ${notificationsCreated} notification(s) for ${returns.length} pending rearrange return(s).`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

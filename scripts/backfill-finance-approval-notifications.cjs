/* eslint-disable no-console */
const { randomUUID } = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const approvals = await prisma.$queryRaw`
    SELECT
      ar."id",
      ar."companyId",
      COALESCE(o."name", o."orderNumber", o."shopifyOrderId", ar."orderId", 'order') AS "invoiceLabel"
    FROM "ApprovalRequest" ar
    LEFT JOIN "Order" o ON o."id" = ar."orderId"
    WHERE ar."type" = 'return_rearrange_payment'
      AND ar."status" = 'pending'
  `;

  let created = 0;

  for (const approval of approvals) {
    const recipients = await prisma.$queryRaw`
      SELECT DISTINCT u."id"
      FROM "User" u
      JOIN "UserRole" ur ON ur."userId" = u."id"
      JOIN "Role" r ON r."id" = ur."roleId"
      LEFT JOIN "RolePermission" rp ON rp."roleId" = ur."roleId"
      LEFT JOIN "Permission" p ON p."id" = rp."permissionId"
      WHERE u."companyId" = ${approval.companyId}
        AND (
          p."key" = 'finance.approvals.manage'
          OR r."name" IN ('admin', 'super_admin')
        )
    `;

    for (const recipient of recipients) {
      const existing = await prisma.$queryRaw`
        SELECT "id"
        FROM "Notification"
        WHERE "companyId" = ${approval.companyId}
          AND "userId" = ${recipient.id}
          AND "type" = 'approval_requested'
          AND "entityType" = 'ApprovalRequest'
          AND "entityId" = ${approval.id}
        LIMIT 1
      `;

      if (existing.length > 0) continue;

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
          ${approval.companyId},
          ${recipient.id},
          'approval_requested',
          'Finance approval requested',
          ${`Bank transfer approval requested for ${approval.invoiceLabel}.`},
          'ApprovalRequest',
          ${approval.id},
          ${new Date()}
        )
      `;
      created += 1;
    }
  }

  console.log(`Backfill complete. Created ${created} notification(s) for ${approvals.length} pending approval request(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

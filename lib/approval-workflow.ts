import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export const RETURN_REARRANGE_PAYMENT_APPROVAL = "return_rearrange_payment";
const FINANCE_APPROVAL_PERMISSION = "finance.approvals.manage";

type NotificationInput = {
  companyId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

export async function createNotification(input: NotificationInput) {
  await prisma.$executeRaw(
    Prisma.sql`
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
        ${input.companyId},
        ${input.userId},
        ${input.type},
        ${input.title},
        ${input.body ?? null},
        ${input.entityType ?? null},
        ${input.entityId ?? null},
        ${new Date()}
      )
    `
  );
}

export async function getFinanceApprovalUserIds(companyId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT DISTINCT u."id"
      FROM "User" u
      JOIN "UserRole" ur ON ur."userId" = u."id"
      JOIN "Role" r ON r."id" = ur."roleId"
      LEFT JOIN "RolePermission" rp ON rp."roleId" = ur."roleId"
      LEFT JOIN "Permission" p ON p."id" = rp."permissionId"
      WHERE u."companyId" = ${companyId}
        AND (
          p."key" = ${FINANCE_APPROVAL_PERMISSION}
          OR r."name" IN ('admin', 'super_admin')
        )
    `
  );

  return rows.map((row) => row.id);
}

export async function createOrGetReturnRearrangeApproval(input: {
  companyId: string;
  orderId: string;
  orderReturnId: string;
  requestedById: string;
  requestNote?: string | null;
  invoiceLabel: string;
}) {
  const existing = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
    Prisma.sql`
      SELECT "id", "status"
      FROM "ApprovalRequest"
      WHERE "companyId" = ${input.companyId}
        AND "type" = ${RETURN_REARRANGE_PAYMENT_APPROVAL}
        AND "orderReturnId" = ${input.orderReturnId}
        AND "status" = 'pending'
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  );

  if (existing[0]) {
    return existing[0];
  }

  const id = randomUUID();
  await prisma.$executeRaw(
    Prisma.sql`
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
        ${id},
        ${input.companyId},
        ${RETURN_REARRANGE_PAYMENT_APPROVAL},
        ${"pending"},
        ${input.orderId},
        ${input.orderReturnId},
        ${input.requestedById},
        ${input.requestNote ?? null},
        ${new Date()},
        ${new Date()}
      )
    `
  );

  const financeUserIds = await getFinanceApprovalUserIds(input.companyId);
  await Promise.all(
    financeUserIds.map((userId) =>
      createNotification({
        companyId: input.companyId,
        userId,
        type: "approval_requested",
        title: "Finance approval requested",
        body: `Bank transfer approval requested for ${input.invoiceLabel}.`,
        entityType: "ApprovalRequest",
        entityId: id,
      })
    )
  );

  return { id, status: "pending" as ApprovalStatus };
}

export async function notifyApprovalRequester(input: {
  companyId: string;
  approvalId: string;
  status: "approved" | "rejected";
  invoiceLabel: string;
  requestedById: string;
}) {
  await createNotification({
    companyId: input.companyId,
    userId: input.requestedById,
    type: `approval_${input.status}`,
    title: input.status === "approved" ? "Finance approval granted" : "Finance approval rejected",
    body:
      input.status === "approved"
        ? `${input.invoiceLabel} is approved for rearrange dispatch.`
        : `${input.invoiceLabel} finance approval was rejected.`,
    entityType: "ApprovalRequest",
    entityId: input.approvalId,
  });
}

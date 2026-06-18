import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { sendFinanceApprovalEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export const RETURN_REARRANGE_PAYMENT_APPROVAL = "return_rearrange_payment";
export const ORDER_PAYMENT_APPROVAL = "order_payment_approval";
export const DELIVERY_PAYMENT_APPROVAL = "delivery_payment_approval";
export const FINANCE_APPROVAL_TYPES = [
  RETURN_REARRANGE_PAYMENT_APPROVAL,
  ORDER_PAYMENT_APPROVAL,
  DELIVERY_PAYMENT_APPROVAL,
] as const;
const FINANCE_APPROVAL_PERMISSION = "finance.approvals.manage";

function normalizeFinancialStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

/** Unpaid orders must not be auto-marked paid on delivery — finance confirms collection first. */
export function orderRequiresDeliveryPaymentApproval(order: {
  financialStatus: string | null;
}): boolean {
  const status = normalizeFinancialStatus(order.financialStatus);
  return status !== "paid" && status !== "voided";
}

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

export async function getFinanceApprovalUsers(companyId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; email: string | null }>>(
    Prisma.sql`
      SELECT DISTINCT u."id", u."email"
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
  return rows;
}

export async function getFinanceApprovalUserIds(companyId: string) {
  const users = await getFinanceApprovalUsers(companyId);
  return users.map((u) => u.id);
}

export function isOrderPaymentRequiresApproval(order: {
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
}): boolean {
  const gateways = [order.paymentGatewayPrimary, ...order.paymentGatewayNames]
    .map((g) => g?.toLowerCase().trim() ?? "")
    .filter(Boolean);
  return gateways.some((g) => g.includes("koko") || g.includes("bank"));
}

export async function getOrderPaymentApproval(orderId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
    Prisma.sql`
      SELECT "id", "status"
      FROM "ApprovalRequest"
      WHERE "type" = ${ORDER_PAYMENT_APPROVAL}
        AND "orderId" = ${orderId}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  );
  return rows[0] ?? null;
}

/** True when finance already approved this payment type once (e.g. after HOD revert re-approval). */
export async function hasPriorApprovedPaymentApproval(
  orderId: string,
  type: typeof ORDER_PAYMENT_APPROVAL | typeof DELIVERY_PAYMENT_APPROVAL,
  excludeApprovalId: string,
): Promise<boolean> {
  const prior = await prisma.approvalRequest.findFirst({
    where: {
      orderId,
      type,
      status: "approved",
      id: { not: excludeApprovalId },
    },
    select: { id: true },
  });
  return prior != null;
}

export async function createOrGetOrderPaymentApproval(input: {
  companyId: string;
  orderId: string;
  requestedById: string | null;
  invoiceLabel: string;
  paymentType: string;
  amount: string;
}) {
  const existing = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
    Prisma.sql`
      SELECT "id", "status"
      FROM "ApprovalRequest"
      WHERE "companyId" = ${input.companyId}
        AND "type" = ${ORDER_PAYMENT_APPROVAL}
        AND "orderId" = ${input.orderId}
        AND "status" = 'pending'
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  );
  if (existing[0]) return existing[0];

  const id = randomUUID();
  const rowsAffected = await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "ApprovalRequest" (
        "id", "companyId", "type", "status", "orderId",
        "requestedById", "requestNote", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${input.companyId}, ${ORDER_PAYMENT_APPROVAL}, ${"pending"}, ${input.orderId},
        ${input.requestedById}, ${`${input.paymentType} — amount: ${input.amount}`},
        ${new Date()}, ${new Date()}
      )
      ON CONFLICT DO NOTHING
    `
  );

  // Concurrent insert won the race — return the existing pending approval
  if (rowsAffected === 0) {
    const concurrent = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
      Prisma.sql`
        SELECT "id", "status"
        FROM "ApprovalRequest"
        WHERE "companyId" = ${input.companyId}
          AND "type" = ${ORDER_PAYMENT_APPROVAL}
          AND "orderId" = ${input.orderId}
          AND "status" = 'pending'
        LIMIT 1
      `
    );
    return concurrent[0]!;
  }

  const financeUsers = await getFinanceApprovalUsers(input.companyId);

  await Promise.all(
    financeUsers.map((u) =>
      createNotification({
        companyId: input.companyId,
        userId: u.id,
        type: "approval_requested",
        title: "Finance approval required",
        body: `${input.paymentType} payment approval needed for ${input.invoiceLabel}.`,
        entityType: "ApprovalRequest",
        entityId: id,
      })
    )
  );

  const financeEmails = financeUsers.map((u) => u.email).filter((e): e is string => !!e);
  if (financeEmails.length > 0) {
    void sendFinanceApprovalEmail(financeEmails, input.invoiceLabel, input.paymentType, input.amount).catch(
      (err) => console.error("[Finance approval] Email send failed:", err)
    );
  }

  return { id, status: "pending" as ApprovalStatus };
}

export async function getPendingDeliveryPaymentApproval(orderId: string) {
  return prisma.approvalRequest.findFirst({
    where: { orderId, type: DELIVERY_PAYMENT_APPROVAL, status: "pending" },
    select: { id: true, status: true },
  });
}

export async function createOrGetDeliveryPaymentApproval(input: {
  companyId: string;
  orderId: string;
  requestedById: string | null;
  invoiceLabel: string;
  paymentType: string;
  amount: string;
  collectionNote?: string | null;
}) {
  const existing = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
    Prisma.sql`
      SELECT "id", "status"
      FROM "ApprovalRequest"
      WHERE "companyId" = ${input.companyId}
        AND "type" = ${DELIVERY_PAYMENT_APPROVAL}
        AND "orderId" = ${input.orderId}
        AND "status" = 'pending'
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  );
  if (existing[0]) return existing[0];

  const requestNote = [
    `${input.paymentType} — amount: ${input.amount}`,
    input.collectionNote?.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  const id = randomUUID();
  const rowsAffected = await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "ApprovalRequest" (
        "id", "companyId", "type", "status", "orderId",
        "requestedById", "requestNote", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${input.companyId}, ${DELIVERY_PAYMENT_APPROVAL}, ${"pending"}, ${input.orderId},
        ${input.requestedById}, ${requestNote},
        ${new Date()}, ${new Date()}
      )
      ON CONFLICT DO NOTHING
    `
  );

  if (rowsAffected === 0) {
    const concurrent = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
      Prisma.sql`
        SELECT "id", "status"
        FROM "ApprovalRequest"
        WHERE "companyId" = ${input.companyId}
          AND "type" = ${DELIVERY_PAYMENT_APPROVAL}
          AND "orderId" = ${input.orderId}
          AND "status" = 'pending'
        LIMIT 1
      `
    );
    return concurrent[0]!;
  }

  const financeUsers = await getFinanceApprovalUsers(input.companyId);
  await Promise.all(
    financeUsers.map((u) =>
      createNotification({
        companyId: input.companyId,
        userId: u.id,
        type: "approval_requested",
        title: "Delivery payment confirmation required",
        body: `Confirm payment received for ${input.invoiceLabel} (${input.paymentType}).`,
        entityType: "ApprovalRequest",
        entityId: id,
      })
    )
  );

  const financeEmails = financeUsers.map((u) => u.email).filter((e): e is string => !!e);
  if (financeEmails.length > 0) {
    void sendFinanceApprovalEmail(
      financeEmails,
      input.invoiceLabel,
      `Delivery: ${input.paymentType}`,
      input.amount
    ).catch((err) => console.error("[Finance approval] delivery email send failed:", err));
  }

  return { id, status: "pending" as ApprovalStatus };
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
  const rowsAffected = await prisma.$executeRaw(
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
      ON CONFLICT DO NOTHING
    `
  );

  // Concurrent insert won the race — return the existing pending approval
  if (rowsAffected === 0) {
    const concurrent = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
      Prisma.sql`
        SELECT "id", "status"
        FROM "ApprovalRequest"
        WHERE "companyId" = ${input.companyId}
          AND "type" = ${RETURN_REARRANGE_PAYMENT_APPROVAL}
          AND "orderReturnId" = ${input.orderReturnId}
          AND "status" = 'pending'
        LIMIT 1
      `
    );
    return concurrent[0]!;
  }

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
  requestedById: string | null;
}) {
  if (!input.requestedById) return;
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

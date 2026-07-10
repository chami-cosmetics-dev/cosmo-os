import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import {
  DELIVERY_PAYMENT_APPROVAL,
  DELIVERY_PAYMENT_FINANCE_UI_ENABLED,
  reconcilePendingApprovalsForVoidedOrders,
  resolveViewerFinanceLocationIds,
} from "@/lib/approval-workflow";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

async function dismissStaleApprovalNotifications(companyId: string, userId: string) {
  const now = new Date();
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "Notification" n
      SET "readAt" = COALESCE(n."readAt", ${now})
      FROM "ApprovalRequest" ar
      WHERE n."companyId" = ${companyId}
        AND n."userId" = ${userId}
        AND n."readAt" IS NULL
        AND n."entityType" = 'ApprovalRequest'
        AND n."type" = 'approval_requested'
        AND n."entityId" = ar."id"
        AND ar."status" <> 'pending'
    `
  );
}

/** Hide delivery-payment approval alerts while notifications are disabled (keeps rows for later re-enable). */
async function dismissDeliveryPaymentApprovalNotifications(companyId: string, userId: string) {
  if (DELIVERY_PAYMENT_FINANCE_UI_ENABLED) return;
  const now = new Date();
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "Notification" n
      SET "readAt" = COALESCE(n."readAt", ${now})
      FROM "ApprovalRequest" ar
      WHERE n."companyId" = ${companyId}
        AND n."userId" = ${userId}
        AND n."readAt" IS NULL
        AND n."entityType" = 'ApprovalRequest'
        AND n."type" = 'approval_requested'
        AND n."entityId" = ar."id"
        AND ar."type" = ${DELIVERY_PAYMENT_APPROVAL}
    `
  );
}

/** Mark out-of-scope finance approval alerts as read so the badge clears for scoped users. */
async function dismissOutOfScopeFinanceApprovalNotifications(
  companyId: string,
  userId: string,
  financeLocationIds: string[]
) {
  if (financeLocationIds.length === 0) {
    const now = new Date();
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "Notification" n
        SET "readAt" = COALESCE(n."readAt", ${now})
        WHERE n."companyId" = ${companyId}
          AND n."userId" = ${userId}
          AND n."readAt" IS NULL
          AND n."entityType" = 'ApprovalRequest'
          AND n."type" = 'approval_requested'
      `
    );
    return;
  }

  const now = new Date();
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "Notification" n
      SET "readAt" = COALESCE(n."readAt", ${now})
      FROM "ApprovalRequest" ar
      LEFT JOIN "Order" o ON o."id" = ar."orderId"
      LEFT JOIN "OrderReturn" ort ON ort."id" = ar."orderReturnId"
      LEFT JOIN "Order" ort_order ON ort_order."id" = ort."orderId"
      WHERE n."companyId" = ${companyId}
        AND n."userId" = ${userId}
        AND n."readAt" IS NULL
        AND n."entityType" = 'ApprovalRequest'
        AND n."type" = 'approval_requested'
        AND n."entityId" = ar."id"
        AND (
          COALESCE(o."companyLocationId", ort_order."companyLocationId") IS NULL
          OR COALESCE(o."companyLocationId", ort_order."companyLocationId") NOT IN (${Prisma.join(financeLocationIds)})
        )
    `
  );
}

function approvalLocationScopeSql(financeLocationIds: string[] | null): Prisma.Sql {
  if (financeLocationIds === null) return Prisma.empty;
  if (financeLocationIds.length === 0) {
    return Prisma.sql`
      AND NOT (
        n."entityType" = 'ApprovalRequest'
        AND n."type" = 'approval_requested'
      )
    `;
  }
  return Prisma.sql`
    AND NOT (
      n."entityType" = 'ApprovalRequest'
      AND n."type" = 'approval_requested'
      AND EXISTS (
        SELECT 1
        FROM "ApprovalRequest" ar
        LEFT JOIN "Order" o ON o."id" = ar."orderId"
        LEFT JOIN "OrderReturn" ort ON ort."id" = ar."orderReturnId"
        LEFT JOIN "Order" ort_order ON ort_order."id" = ort."orderId"
        WHERE ar."id" = n."entityId"
          AND (
            COALESCE(o."companyLocationId", ort_order."companyLocationId") IS NULL
            OR COALESCE(o."companyLocationId", ort_order."companyLocationId") NOT IN (${Prisma.join(financeLocationIds)})
          )
      )
    )
  `;
}

export async function GET() {
  const context = await getCurrentUserContext();
  const userId = context?.user?.id;
  const companyId = context?.user?.companyId;
  if (!userId || !companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const financeLocationIds = await resolveViewerFinanceLocationIds(
    userId,
    companyId,
    (context.roleNames as string[]) ?? []
  );

  await reconcilePendingApprovalsForVoidedOrders(companyId);
  await dismissStaleApprovalNotifications(companyId, userId);
  await dismissDeliveryPaymentApprovalNotifications(companyId, userId);
  if (financeLocationIds !== null) {
    await dismissOutOfScopeFinanceApprovalNotifications(companyId, userId, financeLocationIds);
  }

  const hideDeliveryPaymentNotifications = !DELIVERY_PAYMENT_FINANCE_UI_ENABLED;
  const scopeFilter = approvalLocationScopeSql(financeLocationIds);

  const deliveryHideSql = hideDeliveryPaymentNotifications
    ? Prisma.sql`
        AND NOT (
          n."entityType" = 'ApprovalRequest'
          AND n."type" = 'approval_requested'
          AND EXISTS (
            SELECT 1
            FROM "ApprovalRequest" ar
            WHERE ar."id" = n."entityId"
              AND ar."type" = ${DELIVERY_PAYMENT_APPROVAL}
          )
        )
      `
    : Prisma.empty;

  const [notifications, unreadRows] = await Promise.all([
    prisma.$queryRaw<Array<{
      id: string;
      type: string;
      title: string;
      body: string | null;
      entityType: string | null;
      entityId: string | null;
      readAt: Date | null;
      createdAt: Date;
    }>>(
      Prisma.sql`
        SELECT n."id", n."type", n."title", n."body", n."entityType", n."entityId", n."readAt", n."createdAt"
        FROM "Notification" n
        WHERE n."companyId" = ${companyId}
          AND n."userId" = ${userId}
          AND n."readAt" IS NULL
          AND n."type" <> 'erp_sync_failure'
          ${deliveryHideSql}
          ${scopeFilter}
        ORDER BY n."createdAt" DESC
        LIMIT 20
      `
    ),
    prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "Notification" n
        WHERE n."companyId" = ${companyId}
          AND n."userId" = ${userId}
          AND n."readAt" IS NULL
          AND n."type" <> 'erp_sync_failure'
          ${deliveryHideSql}
          ${scopeFilter}
      `
    ),
  ]);

  return NextResponse.json({
    unreadCount: Number(unreadRows[0]?.count ?? 0),
    notifications: notifications.map((item) => ({
      ...item,
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const context = await getCurrentUserContext();
  const userId = context?.user?.id;
  const companyId = context?.user?.companyId;
  if (!userId || !companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : null;
  const type = typeof body.type === "string" ? body.type : null;
  const now = new Date();

  if (id) {
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "Notification"
        SET "readAt" = COALESCE("readAt", ${now})
        WHERE "id" = ${id}
          AND "companyId" = ${companyId}
          AND "userId" = ${userId}
      `
    );
  } else if (type) {
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "Notification"
        SET "readAt" = COALESCE("readAt", ${now})
        WHERE "companyId" = ${companyId}
          AND "userId" = ${userId}
          AND "readAt" IS NULL
          AND "type" = ${type}
      `
    );
  } else {
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "Notification"
        SET "readAt" = COALESCE("readAt", ${now})
        WHERE "companyId" = ${companyId}
          AND "userId" = ${userId}
          AND "readAt" IS NULL
      `
    );
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import {
  DELIVERY_PAYMENT_APPROVAL,
  DELIVERY_PAYMENT_FINANCE_UI_ENABLED,
  reconcilePendingApprovalsForVoidedOrders,
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

export async function GET() {
  const context = await getCurrentUserContext();
  const userId = context?.user?.id;
  const companyId = context?.user?.companyId;
  if (!userId || !companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await reconcilePendingApprovalsForVoidedOrders(companyId);
  await dismissStaleApprovalNotifications(companyId, userId);
  await dismissDeliveryPaymentApprovalNotifications(companyId, userId);

  const hideDeliveryPaymentNotifications = !DELIVERY_PAYMENT_FINANCE_UI_ENABLED;

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
      hideDeliveryPaymentNotifications
        ? Prisma.sql`
            SELECT n."id", n."type", n."title", n."body", n."entityType", n."entityId", n."readAt", n."createdAt"
            FROM "Notification" n
            WHERE n."companyId" = ${companyId}
              AND n."userId" = ${userId}
              AND n."readAt" IS NULL
              AND n."type" <> 'erp_sync_failure'
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
            ORDER BY n."createdAt" DESC
            LIMIT 20
          `
        : Prisma.sql`
            SELECT "id", "type", "title", "body", "entityType", "entityId", "readAt", "createdAt"
            FROM "Notification"
            WHERE "companyId" = ${companyId}
              AND "userId" = ${userId}
              AND "readAt" IS NULL
              AND "type" <> 'erp_sync_failure'
            ORDER BY "createdAt" DESC
            LIMIT 20
          `
    ),
    prisma.$queryRaw<Array<{ count: bigint }>>(
      hideDeliveryPaymentNotifications
        ? Prisma.sql`
            SELECT COUNT(*)::bigint AS count
            FROM "Notification" n
            WHERE n."companyId" = ${companyId}
              AND n."userId" = ${userId}
              AND n."readAt" IS NULL
              AND n."type" <> 'erp_sync_failure'
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
        : Prisma.sql`
            SELECT COUNT(*)::bigint AS count
            FROM "Notification"
            WHERE "companyId" = ${companyId}
              AND "userId" = ${userId}
              AND "readAt" IS NULL
              AND "type" <> 'erp_sync_failure'
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

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getCurrentUserContext();
  const userId = context?.user?.id;
  const companyId = context?.user?.companyId;
  if (!userId || !companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

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
        SELECT "id", "type", "title", "body", "entityType", "entityId", "readAt", "createdAt"
        FROM "Notification"
        WHERE "companyId" = ${companyId}
          AND "userId" = ${userId}
        ORDER BY "createdAt" DESC
        LIMIT 10
      `
    ),
    prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "Notification"
        WHERE "companyId" = ${companyId}
          AND "userId" = ${userId}
          AND "readAt" IS NULL
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

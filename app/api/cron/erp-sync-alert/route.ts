import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type FailedSI = { instance: string; name: string; status: number | string; body: string };
type ErpError = { instance: string; error: string };

function isAuthorized(request: NextRequest) {
  const secret = process.env.ERP_SYNC_ALERT_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("x-erp-alert-key") === secret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { failedSIs = [], erpErrors = [] } = (await request.json()) as {
    failedSIs?: FailedSI[];
    erpErrors?: ErpError[];
  };

  const totalIssues = failedSIs.length + erpErrors.length;
  if (totalIssues === 0) {
    return NextResponse.json({ ok: true, notified: 0 });
  }

  const adminUsers = await prisma.$queryRaw<Array<{ id: string; companyId: string }>>(
    Prisma.sql`
      SELECT DISTINCT u."id", u."companyId"
      FROM "User" u
      JOIN "UserRole" ur ON ur."userId" = u."id"
      JOIN "Role" r ON r."id" = ur."roleId"
      WHERE r."name" IN ('admin', 'super_admin')
    `
  );

  if (adminUsers.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 });
  }

  const title = `ERP sync alert — ${totalIssues} issue(s)`;

  const parts: string[] = [];
  if (failedSIs.length > 0) {
    parts.push(`${failedSIs.length} SI(s) failed: ${failedSIs.map((f) => f.name).join(", ")}`);
  }
  if (erpErrors.length > 0) {
    parts.push(`ERP unreachable: ${erpErrors.map((e) => e.instance).join(", ")}`);
  }
  const body = parts.join(". ");

  const now = new Date();
  for (const user of adminUsers) {
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "Notification" ("id","companyId","userId","type","title","body","entityType","entityId","createdAt")
        VALUES (
          ${randomUUID()},
          ${user.companyId},
          ${user.id},
          ${"erp_sync_failure"},
          ${title},
          ${body},
          ${"ErpSyncAlert"},
          ${null},
          ${now}
        )
      `
    );
  }

  return NextResponse.json({ ok: true, notified: adminUsers.length });
}

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { limitSchema, pageSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("failed_webhooks.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const user = await prisma.user.findUnique({
    where: { id: auth.context!.user!.id },
    select: { companyId: true },
  });
  if (!user?.companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const pageResult = pageSchema.safeParse(request.nextUrl.searchParams.get("page"));
  const limitResult = limitSchema.safeParse(request.nextUrl.searchParams.get("limit"));
  const status = request.nextUrl.searchParams.get("status") === "resolved" ? "processed" : "failed";
  const page = pageResult.success ? pageResult.data : 1;
  const limit = limitResult.success ? limitResult.data : 10;
  const where: Prisma.ErpGrnWebhookWhereInput = { companyId: user.companyId, status };

  const [total, records] = await Promise.all([
    prisma.erpGrnWebhook.count({ where }),
    prisma.erpGrnWebhook.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        documentType: true,
        documentName: true,
        erpCompany: true,
        endpoint: true,
        status: true,
        errorMessage: true,
        attemptCount: true,
        lastAttemptAt: true,
        createdAt: true,
        resolvedAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    items: records.map((record) => ({
      ...record,
      createdAt: record.createdAt.toISOString(),
      lastAttemptAt: record.lastAttemptAt.toISOString(),
      resolvedAt: record.resolvedAt?.toISOString() ?? null,
    })),
    total,
    page,
    limit,
    status: status === "processed" ? "resolved" : "unresolved",
  });
}

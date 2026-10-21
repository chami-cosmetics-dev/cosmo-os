import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("failed_webhooks.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const user = await prisma.user.findUnique({
    where: { id: auth.context!.user!.id },
    select: { companyId: true },
  });
  const { id } = await params;
  const record = await prisma.erpGrnWebhook.findFirst({
    where: { id, companyId: user?.companyId ?? "__none__" },
  });
  if (!record) return NextResponse.json({ error: "ERP webhook not found" }, { status: 404 });

  return NextResponse.json({
    id: record.id,
    documentType: record.documentType,
    documentName: record.documentName,
    erpCompany: record.erpCompany,
    endpoint: record.endpoint,
    status: record.status,
    errorMessage: record.errorMessage,
    errorStack: record.errorStack,
    rawPayload: record.rawPayload,
    attemptCount: record.attemptCount,
    createdAt: record.createdAt.toISOString(),
    lastAttemptAt: record.lastAttemptAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
  });
}

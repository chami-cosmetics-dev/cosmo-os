import { NextRequest, NextResponse } from "next/server";

import { ErpGrnWebhookError, retryErpGrnWebhook } from "@/lib/erp-grn-webhook";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("failed_webhooks.retry");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const user = await prisma.user.findUnique({
    where: { id: auth.context!.user!.id },
    select: { companyId: true },
  });
  const { id } = await params;
  const record = await prisma.erpGrnWebhook.findFirst({
    where: { id, companyId: user?.companyId ?? "__none__" },
    select: { id: true },
  });
  if (!record) return NextResponse.json({ error: "ERP webhook not found" }, { status: 404 });

  try {
    const result = await retryErpGrnWebhook(record.id);
    return NextResponse.json({ ...result, message: "ERP webhook processed successfully" });
  } catch (error) {
    const typedError = error instanceof ErpGrnWebhookError
      ? error
      : new ErpGrnWebhookError(error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: "Retry failed", details: typedError.message, ...(typedError.details ? { validation: typedError.details } : {}) },
      { status: typedError.status },
    );
  }
}

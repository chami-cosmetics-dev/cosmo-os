import { NextRequest, NextResponse } from "next/server";

import { listCallQueueCandidates } from "@/lib/customer-insight/call-queue";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";
import { customerInsightCallQueueCandidatesQuerySchema } from "@/lib/validation/customer-insight";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("contacts.insight.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const roleNames = (auth.context!.roleNames as string[]) ?? [];
  const permissionKeys = (auth.context!.permissionKeys as string[]) ?? [];
  if (!hasInsightAdminView({ roleNames, permissionKeys })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const parsed = customerInsightCallQueueCandidatesQuerySchema.safeParse({
    assignedMerchant: sp.get("assignedMerchant") ?? undefined,
    page: sp.get("page") ?? undefined,
    pageSize: sp.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await listCallQueueCandidates({
    companyId,
    merchantValue: parsed.data.assignedMerchant,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });
  return NextResponse.json(result);
}

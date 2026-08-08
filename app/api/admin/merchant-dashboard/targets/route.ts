import { NextRequest, NextResponse } from "next/server";

import {
  listMerchantRoleUsers,
  upsertMerchantMonthlyTarget,
} from "@/lib/page-data/merchant-dashboard";
import { isCompanyAdminRole } from "@/lib/merchant-role";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { merchantMonthlyTargetUpsertSchema } from "@/lib/validation/merchant-dashboard";

export async function PUT(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const roleNames = (context.roleNames ?? []) as string[];
  const canManage =
    isCompanyAdminRole(roleNames) ||
    hasPermission(context, "dashboard.merchant_targets.manage");
  if (!canManage) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const companyId = context.user.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = merchantMonthlyTargetUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const merchants = await listMerchantRoleUsers(companyId);
  if (!merchants.some((m) => m.id === parsed.data.merchantUserId)) {
    return NextResponse.json(
      { error: "Target user must have a merchant role (e.g. merchant-level-01)" },
      { status: 400 },
    );
  }

  const result = await upsertMerchantMonthlyTarget({
    companyId,
    merchantUserId: parsed.data.merchantUserId,
    yearMonth: parsed.data.yearMonth,
    targetAmount: parsed.data.targetAmount,
    assignedByUserId: context.user.id,
    note: parsed.data.note ?? null,
  });

  return NextResponse.json({
    ok: true,
    action: result.action,
    target: {
      id: result.target.id,
      userId: result.target.userId,
      yearMonth: result.target.yearMonth,
      targetAmount: Number(result.target.targetAmount),
      assignedAt: result.target.assignedAt.toISOString(),
    },
  });
}

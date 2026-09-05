import { NextRequest, NextResponse } from "next/server";

import {
  deleteMerchantMonthlyTarget,
  listMerchantRoleUsers,
  upsertMerchantMonthlyTarget,
} from "@/lib/page-data/merchant-dashboard";
import { isCompanyAdminRole } from "@/lib/merchant-role";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import {
  merchantMonthlyTargetDeleteSchema,
  merchantMonthlyTargetUpsertSchema,
} from "@/lib/validation/merchant-dashboard";

async function requireTargetManager() {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return {
      error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  const roleNames = (context.roleNames ?? []) as string[];
  const canManage =
    isCompanyAdminRole(roleNames) ||
    hasPermission(context, "dashboard.merchant_targets.manage");
  if (!canManage) {
    return {
      error: NextResponse.json({ error: "Permission denied" }, { status: 403 }),
    };
  }

  const companyId = context.user.companyId ?? null;
  if (!companyId) {
    return {
      error: NextResponse.json(
        { error: "No company associated with your account" },
        { status: 404 },
      ),
    };
  }

  return { context, companyId };
}

export async function PUT(request: NextRequest) {
  const auth = await requireTargetManager();
  if ("error" in auth) return auth.error;
  const { context, companyId } = auth;

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
    shopTargetAmount: parsed.data.shopTargetAmount,
    onlineTargetAmount: parsed.data.onlineTargetAmount,
    wholesaleTargetAmount: parsed.data.wholesaleTargetAmount,
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
      shopTargetAmount: result.target.shopTargetAmount
        ? Number(result.target.shopTargetAmount)
        : null,
      onlineTargetAmount: result.target.onlineTargetAmount
        ? Number(result.target.onlineTargetAmount)
        : null,
      wholesaleTargetAmount: result.target.wholesaleTargetAmount
        ? Number(result.target.wholesaleTargetAmount)
        : null,
      assignedAt: result.target.assignedAt.toISOString(),
    },
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireTargetManager();
  if ("error" in auth) return auth.error;
  const { context, companyId } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = merchantMonthlyTargetDeleteSchema.safeParse(body);
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

  const result = await deleteMerchantMonthlyTarget({
    companyId,
    merchantUserId: parsed.data.merchantUserId,
    yearMonth: parsed.data.yearMonth,
    assignedByUserId: context.user.id,
  });

  if (!result.removed) {
    return NextResponse.json(
      { error: "No target set for this merchant/month" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, action: result.action });
}

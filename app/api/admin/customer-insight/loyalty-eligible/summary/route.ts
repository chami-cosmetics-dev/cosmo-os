import { NextRequest, NextResponse } from "next/server";

import { buildLoyaltyEligibleMerchantSummary } from "@/lib/customer-insight/loyalty-eligible-summary";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";
import { customerInsightLoyaltyEligibleSummaryQuerySchema } from "@/lib/validation/customer-insight";

export const dynamic = "force-dynamic";

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
  const parsed = customerInsightLoyaltyEligibleSummaryQuerySchema.safeParse({
    asOf: sp.get("asOf") ?? undefined,
    weekEnd: sp.get("weekEnd") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const summary = await buildLoyaltyEligibleMerchantSummary({
    companyId,
    asOfYmd: parsed.data.asOf,
    weekEndYmd: parsed.data.weekEnd,
  });
  return NextResponse.json(summary);
}

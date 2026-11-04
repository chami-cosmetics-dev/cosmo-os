import { NextResponse } from "next/server";

import { CONTACTS_LOYALTY_MANUAL_ASSIGN } from "@/lib/customer-insight/loyalty-manual";
import { listVisibleLoyaltyReasonTemplates } from "@/lib/customer-insight/loyalty-reason-templates";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requirePermission(CONTACTS_LOYALTY_MANUAL_ASSIGN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const templates = await listVisibleLoyaltyReasonTemplates(companyId);
  return NextResponse.json({ templates });
}

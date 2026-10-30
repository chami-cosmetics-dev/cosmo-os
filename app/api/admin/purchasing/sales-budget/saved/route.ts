import { NextResponse } from "next/server";

import { requireUserContext } from "@/lib/rbac";
import { listSavedBudgets } from "@/lib/sales-budget/saved-view";

export const dynamic = "force-dynamic";

/** Saved Budgets list (same access as the Sales Budget page). */
export async function GET() {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const companyId = auth.user.companyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  try {
    return NextResponse.json({ budgets: await listSavedBudgets(companyId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load saved budgets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

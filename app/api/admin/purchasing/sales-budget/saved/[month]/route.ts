import { NextRequest, NextResponse } from "next/server";

import { requireUserContext } from "@/lib/rbac";
import {
  SALES_BUDGET_ALL_ENTITIES,
  SALES_BUDGET_ALL_OPTION,
} from "@/lib/sales-budget/config";
import { getSavedBudgetView, SavedBudgetViewError } from "@/lib/sales-budget/saved-view";
import { salesBudgetSavedViewQuerySchema } from "@/lib/validation/sales-budget";

export const dynamic = "force-dynamic";

/** Read-only view of one saved month's file (parsed once, then cached on the server). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ month: string }> },
) {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const companyId = auth.user.companyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const { month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }
  const parsed = salesBudgetSavedViewQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const query = parsed.data;
  const pick = (value: string | undefined, all: string) =>
    value && value !== all ? value : null;

  try {
    return NextResponse.json(
      await getSavedBudgetView(companyId, month, {
        ...query,
        entity: pick(query.entity, SALES_BUDGET_ALL_ENTITIES),
        brand: pick(query.brand, SALES_BUDGET_ALL_OPTION),
        priority: pick(query.priority, SALES_BUDGET_ALL_OPTION),
      }),
    );
  } catch (error) {
    if (error instanceof SavedBudgetViewError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Saved sales budget view failed", error);
    return NextResponse.json(
      { error: "The saved budget could not be read. Try again later." },
      { status: 500 },
    );
  }
}

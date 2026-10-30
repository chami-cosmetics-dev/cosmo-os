import { NextRequest, NextResponse } from "next/server";

import { requireUserContext } from "@/lib/rbac";
import { budgetSaveBlockedReason } from "@/lib/sales-budget/budget-month";
import { SALES_BUDGET_ENTITY_CONFIG } from "@/lib/sales-budget/config";
import { loadSalesBudgetBase } from "@/lib/sales-budget/page-data";
import { SalesBudgetSaveError, saveSalesBudget } from "@/lib/sales-budget/saved-budget";
import { salesBudgetSaveBodySchema } from "@/lib/validation/sales-budget";

export const dynamic = "force-dynamic";
/** The first save of a month builds the full budget (every merchant / shop). */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const companyId = auth.user.companyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const parsed = salesBudgetSaveBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;
  // Only during the month before the budget month (Colombo time); checked again in the save.
  const blocked = budgetSaveBlockedReason(body.targetMonth);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });
  const user = {
    companyId,
    userId: auth.user.id,
    userLabel: auth.user.knownName ?? auth.user.name ?? auth.user.email ?? auth.user.id,
    targetMonth: body.targetMonth,
    prices: body.prices,
  };

  try {
    // No edits (any view, incl. "All"): create the month's file or record the save.
    if (body.changes.length === 0) {
      return NextResponse.json(await saveSalesBudget({ ...user, view: null, changes: [] }));
    }

    // Edits: same rule as the screen, a specific merchant / shop and a single channel only.
    const { tab, entity, vat } = body as Required<typeof body>;
    const channel = tab === "shop" ? (body.channel ?? null) : null;
    if (tab === "shop" && channel !== "online" && channel !== "shop") {
      return NextResponse.json(
        { error: "Pick the ONLINE or SHOP channel to save Budgeted Qty." },
        { status: 400 },
      );
    }
    if (tab === "shop") {
      if (!SALES_BUDGET_ENTITY_CONFIG.shop.options.includes(entity)) {
        return NextResponse.json({ error: "Unknown shop" }, { status: 400 });
      }
    } else {
      const base = await loadSalesBudgetBase(companyId);
      if (!base.sales.onlineMerchantIds.has(entity)) {
        return NextResponse.json({ error: "Unknown merchant" }, { status: 400 });
      }
    }

    const result = await saveSalesBudget({
      ...user,
      view: { tab, channel, entity, vat },
      changes: body.changes,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SalesBudgetSaveError) {
      return NextResponse.json(
        { error: error.message, ...error.details },
        { status: error.status },
      );
    }
    console.error("Sales budget save failed", error);
    const message = error instanceof Error ? error.message : "Failed to save the budget";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

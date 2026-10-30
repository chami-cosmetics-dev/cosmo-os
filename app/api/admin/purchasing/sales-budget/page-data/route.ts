import { NextRequest, NextResponse } from "next/server";

import { requireUserContext } from "@/lib/rbac";
import { budgetTargetMonth } from "@/lib/sales-budget/budget-month";
import {
  SALES_BUDGET_ALL_ENTITIES,
  SALES_BUDGET_ALL_OPTION,
  SALES_BUDGET_ENTITY_CONFIG,
  SALES_BUDGET_VAT_LABELS,
  type SalesBudgetPageData,
} from "@/lib/sales-budget/config";
import {
  buildSalesBudgetPage,
  loadSalesBudgetBase,
  resolveSalesBudgetScope,
  type VatClass,
  type SavedQtyEdit,
} from "@/lib/sales-budget/page-data";
import {
  getSalesBudgetFileInfo,
  getSavedBudgetEdits,
} from "@/lib/sales-budget/saved-budget";
import { salesBudgetPageDataQuerySchema } from "@/lib/validation/sales-budget";

/** Saved budget VAT column label → VAT class. */
const VAT_CLASS_BY_LABEL = new Map(
  Object.entries(SALES_BUDGET_VAT_LABELS)
    .filter(([vat]) => vat !== "all")
    .map(([vat, label]) => [label, vat as VatClass]),
);

export const dynamic = "force-dynamic";
/** A refresh regenerates the ERP stock report (Prepared Report), same budget as Stock Trends. */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const companyId = auth.user.companyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = salesBudgetPageDataQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const query = parsed.data;
  const entity =
    query.entity && query.entity !== SALES_BUDGET_ALL_ENTITIES ? query.entity : null;
  if (
    entity &&
    query.tab === "shop" &&
    !SALES_BUDGET_ENTITY_CONFIG.shop.options.includes(entity)
  ) {
    return NextResponse.json({ error: "Unknown shop" }, { status: 400 });
  }

  try {
    const base = await loadSalesBudgetBase(companyId, { refresh: query.refresh });
    // ONLINE merchants are live (Users / Staff), so validate against the loaded list.
    if (entity && query.tab === "online" && !base.sales.onlineMerchantIds.has(entity)) {
      return NextResponse.json({ error: "Unknown merchant" }, { status: 400 });
    }
    const shopChannel = query.tab === "shop" ? query.channel : null;
    const scope = await resolveSalesBudgetScope(base, {
      tab: query.tab,
      entity,
      vat: query.vat,
      shopChannel,
    });

    // Next month's saved budget: Save state + the saved edits (a merchant / shop view shows its
    // own; "All" views add every merchant's / shop's into their sums).
    const targetMonth = budgetTargetMonth();
    const budgetFile = await getSalesBudgetFileInfo(companyId, targetMonth);
    let savedEdits: SavedQtyEdit[] = [];
    if (budgetFile.lastUpdatedAt) {
      try {
        savedEdits = (await getSavedBudgetEdits(companyId, targetMonth)).flatMap((e) => {
          const vat = VAT_CLASS_BY_LABEL.get(e.vat);
          return vat ? [{ ...e, vat }] : [];
        });
      } catch (error) {
        console.error("Sales budget: could not read the saved budget", error);
        // Without the saved values a save could overwrite them, so block it.
        budgetFile.blockedReason = "Could not read the saved budget. Try again later.";
      }
    }

    const result = await buildSalesBudgetPage(scope, {
      savedEdits,
      q: query.q,
      brand: query.brand && query.brand !== SALES_BUDGET_ALL_OPTION ? query.brand : null,
      priority:
        query.priority && query.priority !== SALES_BUDGET_ALL_OPTION ? query.priority : null,
      page: query.page,
      limit: query.limit,
    });
    return NextResponse.json({ ...result, budgetFile } satisfies SalesBudgetPageData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sales budget";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

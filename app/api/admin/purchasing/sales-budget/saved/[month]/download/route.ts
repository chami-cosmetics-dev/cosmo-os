import { NextResponse } from "next/server";

import { requireUserContext } from "@/lib/rbac";
import { addMonths, budgetBundleNames } from "@/lib/sales-budget/budget-month";
import { zipFiles } from "@/lib/sales-budget/export-workbook";
import { loadSalesBudgetBase } from "@/lib/sales-budget/page-data";
import { buildSavedBudgetWorkbook } from "@/lib/sales-budget/saved-budget";
import { buildSalesHistoryCsv } from "@/lib/sales-budget/sales-history";

export const dynamic = "force-dynamic";
/** The sales history's VAT status needs the ERP tax data (built if the screen hasn't yet). */
export const maxDuration = 300;

const NOT_FOUND = "The saved file could not be found";

/**
 * The saved month's files (Open or Locked): Sales_Budget_<Mon>_<Year>_<Last Updated>.zip with
 * the budget Excel (built from the saved snapshot, never from live data) and the sales history
 * CSV, built now from the orders for the months before the save month — the completed months
 * its Highest Sale Qty covered, which no longer change.
 */
export async function GET(
  _request: Request,
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

  try {
    const saved = await buildSavedBudgetWorkbook(companyId, month);
    if (!saved) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    // Saves happen in the month before the budget month, so that month is the first excluded.
    const csv = await buildSalesHistoryCsv(
      await loadSalesBudgetBase(companyId),
      addMonths(month, -1),
    );
    const names = budgetBundleNames(month, saved.lastUpdatedAt.toISOString());
    const zip = zipFiles([
      { name: names.xlsx, content: saved.buffer },
      { name: names.csv, content: Buffer.from(csv, "utf8") },
    ]);
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${names.zip}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Saved sales budget download failed", error);
    return NextResponse.json(
      { error: "The saved file could not be read. Try again later." },
      { status: 500 },
    );
  }
}

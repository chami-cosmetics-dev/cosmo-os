import { NextResponse } from "next/server";

import { requireUserContext } from "@/lib/rbac";
import { budgetBundleNames, budgetTargetMonth } from "@/lib/sales-budget/budget-month";
import type { SalesBudgetExportMessage } from "@/lib/sales-budget/config";
import { buildSalesBudgetExport } from "@/lib/sales-budget/export";
import { writeSalesBudgetWorkbook, zipFiles } from "@/lib/sales-budget/export-workbook";
import { loadSalesBudgetBase } from "@/lib/sales-budget/page-data";
import { buildSalesHistoryCsv } from "@/lib/sales-budget/sales-history";

export const dynamic = "force-dynamic";
/** May need to build the ERP stock report if the screen hasn't loaded it yet. */
export const maxDuration = 300;

/**
 * Streams the Export as JSON lines (SalesBudgetExportMessage): progress percents while it is
 * built (stock + sales data, each merchant / shop block, sales history, Excel, zip), then the zip:
 * the budget Excel + the sales history CSV behind its Highest Sale Qty (built now from the
 * orders, months before the current one). Named like a saved budget: next month (Colombo) +
 * today, e.g. Sales_Budget_Nov_2026_27.10.2026.zip.
 */
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (message: SalesBudgetExportMessage) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      let sent = 0;
      const progress = (percent: number) => {
        const value = Math.min(99, Math.round(percent));
        if (value > sent) send({ percent: (sent = value) });
      };
      try {
        progress(2);
        const base = await loadSalesBudgetBase(companyId);
        progress(15);
        // Merchant / shop blocks: 15–80%. The sales history builds alongside.
        const [sections, csv] = await Promise.all([
          buildSalesBudgetExport(companyId, base, (done, total) =>
            progress(15 + (done / total) * 65),
          ),
          buildSalesHistoryCsv(base, base.sales.currentMonth),
        ]);
        progress(85);
        const xlsx = writeSalesBudgetWorkbook(sections);
        progress(95);
        const now = new Date();
        const names = budgetBundleNames(budgetTargetMonth(now), now.toISOString());
        const zip = zipFiles([
          { name: names.xlsx, content: xlsx },
          { name: names.csv, content: Buffer.from(csv, "utf8") },
        ]);
        send({ name: names.zip, file: zip.toString("base64") });
      } catch (error) {
        send({ error: error instanceof Error ? error.message : "Failed to export sales budget" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

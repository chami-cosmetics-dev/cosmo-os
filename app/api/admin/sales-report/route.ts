import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { runSalesReport, runSalesPromotion, salesReportSettingsForClient } from "@/lib/sales-report/run";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
function reportDate(value: string | null) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10); }

export async function GET(request: NextRequest) {
  if (isVaultOsDeployment()) return NextResponse.json({ error: "Sales Report is unavailable" }, { status: 404 });
  const auth = await requirePermission("finance.sales_report.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  try {
    const fromDate = reportDate(request.nextUrl.searchParams.get("from"));
    const toDate = reportDate(request.nextUrl.searchParams.get("to"));
    if (fromDate > toDate) return NextResponse.json({ error: "From date cannot be after the To date" }, { status: 400 });
    const { result, settings } = await runSalesReport(companyId, fromDate, toDate);
    return NextResponse.json({ fromDate, toDate, days: result.days, checks: result.checks, totals: { showroom: result.totalShowroom, online: result.totalOnline, total: result.totalShowroom + result.totalOnline }, pivot: result.pivot, reviewCount: result.review.length, vat: result.vat ? { total: result.vat.vatTotal, palmers: result.vat.palmersTotal, checks: result.vat.checks } : null, settings: salesReportSettingsForClient(settings) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Sales report failed" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  if (isVaultOsDeployment()) return NextResponse.json({ error: "Sales Report is unavailable" }, { status: 404 });
  const auth = await requirePermission("finance.sales_report.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  try {
    const body = await request.json();
    const fromDate = reportDate(body.fromDate);
    const toDate = reportDate(body.toDate);
    if (fromDate > toDate) return NextResponse.json({ error: "From date cannot be after the To date" }, { status: 400 });
    if (body.kind === "promotion") {
      const codes: string[] = Array.isArray(body.codes) ? (body.codes as unknown[]).map(String).map((code: string) => code.trim().toLowerCase()).filter(Boolean) : [];
      const mode = body.mode === "starts" || body.mode === "contains" ? body.mode : "exact";
      if (!codes.length) return NextResponse.json({ error: "Enter at least one coupon code" }, { status: 400 });
      const promotion = await runSalesPromotion(companyId, fromDate, toDate, codes, mode);
      return NextResponse.json({ fromDate, toDate, codes, mode, promotion: promotion.summary, settings: salesReportSettingsForClient(promotion.settings) });
    }
    const { result, settings } = await runSalesReport(companyId, fromDate, toDate);
    return NextResponse.json({ fromDate, toDate, days: result.days, checks: result.checks, totals: { showroom: result.totalShowroom, online: result.totalOnline, total: result.totalShowroom + result.totalOnline }, pivot: result.pivot, reviewCount: result.review.length, vat: result.vat ? { total: result.vat.vatTotal, palmers: result.vat.palmersTotal, checks: result.vat.checks } : null, settings: salesReportSettingsForClient(settings) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Sales report failed" }, { status: 500 }); }
}

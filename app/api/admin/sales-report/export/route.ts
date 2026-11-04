import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { buildSalesReportFile } from "@/lib/sales-report/run";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
async function handleExport(request: NextRequest) {
  if (isVaultOsDeployment()) return NextResponse.json({ error: "Sales Report is unavailable" }, { status: 404 });
  const auth = await requirePermission("finance.sales_report.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  try {
    const body = request.method === "POST" ? await request.json() : {};
    const fromDate = request.nextUrl.searchParams.get("from") || (typeof body.from === "string" ? body.from : new Date().toISOString().slice(0, 10));
    const toDate = request.nextUrl.searchParams.get("to") || (typeof body.to === "string" ? body.to : fromDate);
    if (fromDate > toDate) return NextResponse.json({ error: "From date cannot be after the To date" }, { status: 400 });
    const kind = request.nextUrl.searchParams.get("kind") || body.kind;
    const reportKind: "final" | "workings" | "review" | "promotion" = kind === "workings" || kind === "review" || kind === "promotion" ? kind : "final";
    const promotion = reportKind === "promotion" ? { codes: Array.isArray(body.codes) ? body.codes.map(String) : [], mode: body.mode === "starts" || body.mode === "contains" ? body.mode : "exact" } : undefined;
    const { buffer, fileName } = await buildSalesReportFile(companyId, fromDate, toDate, reportKind, undefined, promotion);
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Sales report export failed" }, { status: 500 }); }
}

export async function GET(request: NextRequest) { return handleExport(request); }
export async function POST(request: NextRequest) { return handleExport(request); }

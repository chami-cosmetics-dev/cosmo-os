import { NextRequest, NextResponse } from "next/server";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { loadSalesReportConfig, saveSalesReportConfig, validateSalesReportConfig } from "@/lib/sales-report/config";
import { mergeSalesReportSettings, salesReportSettingsForClient } from "@/lib/sales-report/run";

export const dynamic = "force-dynamic";

async function authorizedCompany(permission: "finance.sales_report.read" | "finance.sales_report.manage") {
  if (isVaultOsDeployment()) return { error: NextResponse.json({ error: "Sales Report is unavailable" }, { status: 404 }) };
  const auth = await requirePermission(permission);
  if (!auth.ok) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const companyId = auth.context?.user?.companyId;
  return companyId ? { companyId, canEdit: hasPermission(auth.context, "finance.sales_report.manage") } : { error: NextResponse.json({ error: "No company associated with your account" }, { status: 404 }) };
}

export async function GET() {
  const auth = await authorizedCompany("finance.sales_report.read");
  if (auth.error) return auth.error;
  const settings = mergeSalesReportSettings(await loadSalesReportConfig(auth.companyId!));
  return NextResponse.json({ settings: salesReportSettingsForClient(settings), canEdit: auth.canEdit });
}

export async function PUT(request: NextRequest) {
  const auth = await authorizedCompany("finance.sales_report.manage");
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray(body.rows) || !body.maps || typeof body.maps !== "object") {
    return NextResponse.json({ error: "Invalid report settings" }, { status: 400 });
  }
  const invalid = validateSalesReportConfig(body as Record<string, unknown>);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const settings = mergeSalesReportSettings(body);
  await saveSalesReportConfig(auth.companyId!, settings);
  return NextResponse.json({ settings: salesReportSettingsForClient(settings) });
}

import { NextResponse } from "next/server";

import { getCurrentColomboReportDate } from "@/lib/grn-pending-email";
import { buildMarginIssuesWorkbook } from "@/lib/margin-issues-email";
import { loadMarginIssuesReport } from "@/lib/margin-issues";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(context, "purchasing.purchase_history.read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = context.user.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const reportDate = getCurrentColomboReportDate();
  const report = await loadMarginIssuesReport(companyId, reportDate);
  const buffer = buildMarginIssuesWorkbook(report);
  const filename = `margin-issues-${reportDate}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

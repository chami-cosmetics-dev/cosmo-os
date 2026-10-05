import { NextRequest, NextResponse } from "next/server";

import { buildCallQueueSalesReportWorkbook } from "@/lib/customer-insight/call-queue-report-export";
import { listCallQueueSalesReport } from "@/lib/customer-insight/call-queue-report";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";
import { customerInsightCallQueueReportQuerySchema } from "@/lib/validation/customer-insight";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("contacts.insight.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const roleNames = (auth.context!.roleNames as string[]) ?? [];
  const permissionKeys = (auth.context!.permissionKeys as string[]) ?? [];
  if (!hasInsightAdminView({ roleNames, permissionKeys })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const parsed = customerInsightCallQueueReportQuerySchema.safeParse({
    assignedMerchant: sp.get("assignedMerchant") ?? undefined,
    assignedFrom: sp.get("assignedFrom") ?? undefined,
    assignedTo: sp.get("assignedTo") ?? undefined,
    status: sp.get("status") ?? undefined,
    pushToGold: sp.get("pushToGold") ?? undefined,
    pushToPlatinum: sp.get("pushToPlatinum") ?? undefined,
    notContacted: sp.get("notContacted") ?? undefined,
    notInterestedInLoyalty: sp.get("notInterestedInLoyalty") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const report = await listCallQueueSalesReport({
    companyId,
    ...parsed.data,
  });
  const { buffer, filename } = buildCallQueueSalesReportWorkbook({
    rows: report.rows,
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

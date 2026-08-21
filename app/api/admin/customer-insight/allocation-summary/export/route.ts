import { NextResponse } from "next/server";

import { listMerchantAllocationCounts } from "@/lib/customer-insight/allocation-summary";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { logReportDownload } from "@/lib/report-download-log";
import { requirePermission } from "@/lib/rbac";
import { buildCsv, type CsvPrimitive } from "@/lib/reports/csv";

export async function GET() {
  const auth = await requirePermission("contacts.insight.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  const user = auth.context!.user;
  if (!companyId || !user) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const roleNames = (auth.context!.roleNames as string[]) ?? [];
  const permissionKeys = (auth.context!.permissionKeys as string[]) ?? [];
  if (!hasInsightAdminView({ roleNames, permissionKeys })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summary = await listMerchantAllocationCounts(companyId);
  const fileName = "insight-merchant-allocation-summary.csv";
  const headers = [
    "merchant",
    "merchant_value",
    "allocated_contacts",
  ] as const;
  const rows: Array<Record<(typeof headers)[number], CsvPrimitive>> = [
    ...summary.rows.map((r) => ({
      merchant: r.merchantLabel,
      merchant_value: r.merchantValue,
      allocated_contacts: r.count,
    })),
    {
      merchant: "Unallocated",
      merchant_value: "",
      allocated_contacts: summary.unallocatedCount,
    },
  ];

  await logReportDownload({
    companyId,
    userId: user.id,
    reportKey: "customer_insight:allocation_summary",
    reportLabel: "Customer Insight Allocation Summary",
    fileName,
  });

  const csv = buildCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

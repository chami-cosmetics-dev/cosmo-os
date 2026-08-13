import { NextRequest, NextResponse } from "next/server";

import { FILTER_EXPORT_CAP } from "@/lib/customer-insight/filters";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { prisma } from "@/lib/prisma";
import { logReportDownload } from "@/lib/report-download-log";
import { requirePermission } from "@/lib/rbac";
import { buildCsv, formatIsoDate, type CsvPrimitive } from "@/lib/reports/csv";
import { customerInsightMerchantExportQuerySchema } from "@/lib/validation/customer-insight";

export async function GET(request: NextRequest) {
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

  const parsed = customerInsightMerchantExportQuerySchema.safeParse({
    assignedMerchant: request.nextUrl.searchParams.get("assignedMerchant") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const merchant = parsed.data.assignedMerchant;
  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId,
      assignedMerchant: { equals: merchant, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      city: true,
      assignedMerchant: true,
      lastPurchaseAt: true,
      recentMerchant: true,
    },
    orderBy: [{ lastPurchaseAt: "desc" }, { updatedAt: "desc" }],
    take: FILTER_EXPORT_CAP,
  });

  const headers = [
    "contact_id",
    "name",
    "phone_number",
    "email",
    "city",
    "assigned_merchant",
    "recent_merchant",
    "last_purchased_date",
  ] as const;

  const rows: Array<Record<string, CsvPrimitive>> = contacts.map((row) => ({
    contact_id: row.id,
    name: row.name,
    phone_number: row.phoneNumber ?? "",
    email: row.email ?? "",
    city: row.city ?? "",
    assigned_merchant: row.assignedMerchant ?? "",
    recent_merchant: row.recentMerchant ?? "",
    last_purchased_date: formatIsoDate(row.lastPurchaseAt),
  }));

  const safeMerchant = merchant.replace(/[^\w.-]+/g, "_").slice(0, 40) || "merchant";
  const fileName = `customer-insight-merchant-${safeMerchant}.csv`;
  await logReportDownload({
    companyId,
    userId: user.id,
    reportKey: "customer_insight:merchant_export",
    reportLabel: "Customer Insight Merchant Export",
    filters: `assignedMerchant=${merchant}`,
    fileName,
  });

  return new NextResponse(buildCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

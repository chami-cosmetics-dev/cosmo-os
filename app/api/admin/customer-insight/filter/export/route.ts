import { NextRequest, NextResponse } from "next/server";

import {
  FILTER_EXPORT_CAP,
  filterAllocatedContacts,
} from "@/lib/customer-insight/filters";
import {
  canFilterAllInsightContacts,
  hasInsightAdminView,
} from "@/lib/customer-insight/ownership";
import { prisma } from "@/lib/prisma";
import { logReportDownload } from "@/lib/report-download-log";
import { requirePermission } from "@/lib/rbac";
import { buildCsv, formatIsoDate, type CsvPrimitive } from "@/lib/reports/csv";
import { customerInsightFilterExportQuerySchema } from "@/lib/validation/customer-insight";

function queryParam(value: string | null): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed || undefined;
}

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

  const sp = request.nextUrl.searchParams;
  const parsed = customerInsightFilterExportQuerySchema.safeParse({
    brand: queryParam(sp.get("brand")),
    item: queryParam(sp.get("item")),
    city: queryParam(sp.get("city")),
    minTotal: queryParam(sp.get("minTotal")),
    maxTotal: queryParam(sp.get("maxTotal")),
    birthdayFrom: queryParam(sp.get("birthdayFrom")),
    birthdayTo: queryParam(sp.get("birthdayTo")),
    lastContactedFrom: queryParam(sp.get("lastContactedFrom")),
    lastContactedTo: queryParam(sp.get("lastContactedTo")),
    loyaltyRegisteredFrom: queryParam(sp.get("loyaltyRegisteredFrom")),
    loyaltyRegisteredTo: queryParam(sp.get("loyaltyRegisteredTo")),
    noPurchaseFrom: queryParam(sp.get("noPurchaseFrom")),
    noPurchaseTo: queryParam(sp.get("noPurchaseTo")),
    noPurchaseMonths: queryParam(sp.get("noPurchaseMonths")),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { couponCodes: true },
  });
  const viewer = {
    knownName: user.knownName ?? null,
    name: user.name ?? null,
    email: user.email ?? null,
    roleNames,
    couponCodes: dbUser?.couponCodes ?? null,
  };

  const scopeAllContacts = canFilterAllInsightContacts({
    roleNames,
    permissionKeys,
  });

  const result = await filterAllocatedContacts({
    companyId,
    viewer,
    isAdmin: true,
    scopeAllContacts,
    brand: parsed.data.brand,
    item: parsed.data.item,
    city: parsed.data.city,
    minTotal: parsed.data.minTotal,
    maxTotal: parsed.data.maxTotal,
    birthdayFrom: parsed.data.birthdayFrom,
    birthdayTo: parsed.data.birthdayTo,
    lastContactedFrom: parsed.data.lastContactedFrom,
    lastContactedTo: parsed.data.lastContactedTo,
    loyaltyRegisteredFrom: parsed.data.loyaltyRegisteredFrom,
    loyaltyRegisteredTo: parsed.data.loyaltyRegisteredTo,
    noPurchaseFrom: parsed.data.noPurchaseFrom,
    noPurchaseTo: parsed.data.noPurchaseTo,
    noPurchaseMonths: parsed.data.noPurchaseMonths,
    page: 1,
    pageSize: 25,
    forExport: true,
  });

  const includeBrand = Boolean(parsed.data.brand?.trim());
  const includeItem = Boolean(parsed.data.item?.trim());
  const headers = [
    "contact_id",
    "name",
    "phone_number",
    "assigned_merchant",
    "lifetime_total",
    "loyalty_tier",
    "loyalty_code",
    "last_purchased_date",
    ...(includeBrand ? (["brand_spend"] as const) : []),
    ...(includeItem ? (["item_spend"] as const) : []),
  ] as const;

  const rows: Array<Record<string, CsvPrimitive>> = result.items.map((row) => ({
    contact_id: row.contactId,
    name: row.name,
    phone_number: row.phoneNumber ?? "",
    assigned_merchant: row.assignedMerchant ?? "",
    lifetime_total: row.lifetimeTotal.toFixed(2),
    loyalty_tier: row.loyalty.label,
    loyalty_code: row.loyalty.code ?? "",
    last_purchased_date: row.lastPurchaseAt
      ? formatIsoDate(new Date(row.lastPurchaseAt))
      : "",
    ...(includeBrand
      ? { brand_spend: (row.brandSpend ?? 0).toFixed(2) }
      : {}),
    ...(includeItem ? { item_spend: (row.itemSpend ?? 0).toFixed(2) } : {}),
  }));

  const fileName = "customer-insight-filter-export.csv";
  await logReportDownload({
    companyId,
    userId: user.id,
    reportKey: "customer_insight:filter_export",
    reportLabel: "Customer Insight Filter Export",
    filters: sp.toString(),
    fileName,
  });

  const csv = buildCsv(headers, rows);
  const truncatedNote =
    result.pagination.total > FILTER_EXPORT_CAP
      ? `\r\n# truncated_to,${FILTER_EXPORT_CAP},of,${result.pagination.total}`
      : "";

  return new NextResponse(`${csv}${truncatedNote}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

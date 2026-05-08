import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { logReportDownload } from "@/lib/report-download-log";
import { buildCsv, formatIsoDate, formatIsoDateTime } from "@/lib/reports/csv";
import { getContactReportPermission } from "@/lib/report-permissions";
import { requirePermission } from "@/lib/rbac";

type ContactReportKind = "last-purchased" | "log" | "loyalty";

function parseContactReport(value: string | null): ContactReportKind {
  if (value === "log") return "log";
  if (value === "loyalty") return "loyalty";
  return "last-purchased";
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const report = parseContactReport(request.nextUrl.searchParams.get("report"));
  const auth = await requirePermission(getContactReportPermission(report));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId,
      ...(report === "loyalty" ? { lastPurchaseAt: { not: null } } : {}),
    },
    orderBy: [{ lastPurchaseAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      recentMerchant: true,
      lastPurchaseAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const payload =
    report === "log"
      ? buildCsv(
          ["contact_id", "name", "email", "phone_number", "created_at", "updated_at", "recent_merchant", "last_purchased_date"],
          contacts.map((contact) => ({
            contact_id: contact.id,
            name: contact.name,
            email: contact.email ?? "",
            phone_number: contact.phoneNumber ?? "",
            created_at: formatIsoDateTime(contact.createdAt),
            updated_at: formatIsoDateTime(contact.updatedAt),
            recent_merchant: contact.recentMerchant ?? "",
            last_purchased_date: formatIsoDate(contact.lastPurchaseAt),
          }))
        )
      : buildCsv(
          ["contact_id", "name", "email", "phone_number", "recent_merchant", "last_purchased_date", "updated_on"],
          contacts.map((contact) => ({
            contact_id: contact.id,
            name: contact.name,
            email: contact.email ?? "",
            phone_number: contact.phoneNumber ?? "",
            recent_merchant: contact.recentMerchant ?? "",
            last_purchased_date: formatIsoDate(contact.lastPurchaseAt),
            updated_on: formatIsoDate(contact.updatedAt),
          }))
        );

  const fileName =
    report === "log"
      ? "contact-log-details.csv"
      : report === "loyalty"
        ? "loyalty-customers.csv"
        : "contact-last-purchased-date.csv";

  const reportLabel =
    report === "log"
      ? "Contact Number Log Details"
      : report === "loyalty"
        ? "Loyalty Customer List"
        : "Contact Number with Last Purchased Date";

  await logReportDownload({
    companyId,
    userId: auth.context?.user?.id,
    reportKey: `contacts:${report}`,
    reportLabel,
    filters: `report=${report}`,
    fileName,
  });

  return new NextResponse(payload, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

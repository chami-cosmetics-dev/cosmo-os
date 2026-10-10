import { NextRequest, NextResponse } from "next/server";

import { loadAssignedMerchantAliasMap } from "@/lib/customer-insight/allocation-summary";
import { firstPurchaseAtByContactIds } from "@/lib/customer-insight/first-purchase";
import { prisma } from "@/lib/prisma";
import { logReportDownload } from "@/lib/report-download-log";
import {
  CONTACT_LIST_DUMP_SELECT,
  buildContactLogDumpCsv,
  buildLastPurchasedDumpCsv,
  buildLoyaltyDumpCsv,
} from "@/lib/reports/contact-list-dump";
import { getContactReportPermission } from "@/lib/report-permissions";
import { requirePermission } from "@/lib/rbac";
import { osRegistrationDumpExcludeWhere } from "@/lib/register-users/dump-exclude";

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
      AND: [
        osRegistrationDumpExcludeWhere(),
        ...(report === "loyalty"
          ? [
              {
                OR: [
                  { lastPurchaseAt: { not: null } },
                  { loyaltyAssignedTier: { not: null } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ lastPurchaseAt: "desc" }, { updatedAt: "desc" }],
    select: CONTACT_LIST_DUMP_SELECT,
  });

  const [firstPurchaseById, aliasToRoster] = await Promise.all([
    firstPurchaseAtByContactIds(
      companyId,
      contacts.map((contact) => contact.id)
    ),
    loadAssignedMerchantAliasMap(companyId),
  ]);
  const withFirstPurchase = contacts.map((contact) => ({
    ...contact,
    firstPurchaseAt: firstPurchaseById.get(contact.id) ?? null,
  }));
  const payload =
    report === "log"
      ? buildContactLogDumpCsv(withFirstPurchase, aliasToRoster)
      : report === "loyalty"
        ? buildLoyaltyDumpCsv(withFirstPurchase, aliasToRoster)
        : buildLastPurchasedDumpCsv(withFirstPurchase, aliasToRoster);

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

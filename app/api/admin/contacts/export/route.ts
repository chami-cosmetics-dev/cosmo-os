import { NextRequest, NextResponse } from "next/server";

import { logReportDownload } from "@/lib/report-download-log";
import { buildCsv, formatIsoDate, formatIsoDateTime } from "@/lib/reports/csv";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

type ContactStatusFilter = "active" | "inactive" | "never_purchased" | null;

const ACTIVE_WINDOW_DAYS = 180;

function getActiveCutoff() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ACTIVE_WINDOW_DAYS);
  return cutoff;
}

function parseStatus(value: string | null): ContactStatusFilter {
  if (value === "active" || value === "inactive" || value === "never_purchased") {
    return value;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const status = parseStatus(request.nextUrl.searchParams.get("status"));
  const search = request.nextUrl.searchParams.get("search")?.trim() || null;
  const cutoff = getActiveCutoff();

  const where: Parameters<typeof prisma.contactMaster.findMany>[0]["where"] = { companyId };
  if (status === "active") {
    where.lastPurchaseAt = { gte: cutoff };
  } else if (status === "inactive") {
    where.lastPurchaseAt = { lt: cutoff };
  } else if (status === "never_purchased") {
    where.lastPurchaseAt = null;
  }

  if (search) {
    where.AND = [
      {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phoneNumber: { contains: search, mode: "insensitive" } },
          { recentMerchant: { contains: search, mode: "insensitive" } },
        ],
      },
    ];
  }

  const contacts = await prisma.contactMaster.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
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

  const csv = buildCsv(
    ["contact_id", "name", "email", "phone_number", "recent_merchant", "last_purchased_date", "created_at", "updated_at"],
    contacts.map((contact) => ({
      contact_id: contact.id,
      name: contact.name,
      email: contact.email ?? "",
      phone_number: contact.phoneNumber ?? "",
      recent_merchant: contact.recentMerchant ?? "",
      last_purchased_date: formatIsoDate(contact.lastPurchaseAt),
      created_at: formatIsoDateTime(contact.createdAt),
      updated_at: formatIsoDateTime(contact.updatedAt),
    }))
  );

  const fileName = "contact-master-export.csv";
  await logReportDownload({
    companyId,
    userId: auth.context?.user?.id,
    reportKey: "contacts:master_export",
    reportLabel: "Contact Master Export",
    filters: `status=${status ?? "all"}&search=${search ?? ""}`,
    fileName,
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

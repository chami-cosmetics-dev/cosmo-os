import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { logReportDownload } from "@/lib/report-download-log";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { buildCsv, formatIsoDate, formatIsoDateTime } from "@/lib/reports/csv";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

type ContactStatusFilter = "active" | "inactive" | "never_purchased" | null;
type ContactExportMode = "contacts" | "purchase_summary";

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

function parseMode(value: string | null): ContactExportMode {
  if (value === "purchase_summary") return "purchase_summary";
  return "contacts";
}

function normalizePhone(value: string | null | undefined) {
  return value?.trim() || "";
}

async function buildPurchaseSummary(
  companyId: string,
  contacts: Array<{ id: string; phoneNumber: string | null }>
) {
  const contactVariants = new Map<string, Set<string>>();
  const allVariants = new Set<string>();

  for (const contact of contacts) {
    const phone = normalizePhone(contact.phoneNumber);
    if (!phone) continue;
    const variants = new Set(buildPhoneLookupVariants(phone));
    contactVariants.set(contact.id, variants);
    for (const variant of variants) {
      allVariants.add(variant);
    }
  }

  if (allVariants.size === 0) {
    return new Map<string, { orderCount: number; totalSpent: number; lastOrderAt: Date | null }>();
  }

  const variantToContactIds = new Map<string, Set<string>>();
  for (const [contactId, variants] of contactVariants.entries()) {
    for (const variant of variants) {
      const ids = variantToContactIds.get(variant) ?? new Set<string>();
      ids.add(contactId);
      variantToContactIds.set(variant, ids);
    }
  }

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      customerPhone: { in: [...allVariants] },
    },
    select: {
      customerPhone: true,
      totalPrice: true,
      createdAt: true,
    },
  });

  const summary = new Map<string, { orderCount: number; totalSpent: number; lastOrderAt: Date | null }>();

  for (const order of orders) {
    const phone = normalizePhone(order.customerPhone);
    if (!phone) continue;
    const matchingContactIds = variantToContactIds.get(phone);
    if (!matchingContactIds || matchingContactIds.size !== 1) continue;

    const [contactId] = [...matchingContactIds];
    const current = summary.get(contactId) ?? { orderCount: 0, totalSpent: 0, lastOrderAt: null };
    current.orderCount += 1;
    current.totalSpent += Number(order.totalPrice);
    if (!current.lastOrderAt || order.createdAt > current.lastOrderAt) {
      current.lastOrderAt = order.createdAt;
    }
    summary.set(contactId, current);
  }

  return summary;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("contacts.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const status = parseStatus(request.nextUrl.searchParams.get("status"));
  const mode = parseMode(request.nextUrl.searchParams.get("mode"));
  const search = request.nextUrl.searchParams.get("search")?.trim() || null;
  const cutoff = getActiveCutoff();

  const where: Prisma.ContactMasterWhereInput = { companyId };
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

  const purchaseSummary =
    mode === "purchase_summary" ? await buildPurchaseSummary(companyId, contacts) : null;

  const csv = buildCsv(
    mode === "purchase_summary"
      ? [
          "contact_no",
          "name",
          "email",
          "phone_number",
          "recent_merchant",
          "total_orders",
          "total_purchase_value",
          "last_order_date",
          "last_purchased_date",
          "created_at",
          "updated_at",
        ]
      : ["contact_no", "name", "email", "phone_number", "recent_merchant", "last_purchased_date", "created_at", "updated_at"],
    contacts.map((contact, index) => {
      const summary = purchaseSummary?.get(contact.id);
      return {
        contact_no: index + 1,
        name: contact.name,
        email: contact.email ?? "",
        phone_number: contact.phoneNumber ?? "",
        recent_merchant: contact.recentMerchant ?? "",
        ...(mode === "purchase_summary"
          ? {
              total_orders: summary?.orderCount ?? 0,
              total_purchase_value: (summary?.totalSpent ?? 0).toFixed(2),
              last_order_date: formatIsoDate(summary?.lastOrderAt ?? null),
            }
          : {}),
        last_purchased_date: formatIsoDate(contact.lastPurchaseAt),
        created_at: formatIsoDateTime(contact.createdAt),
        updated_at: formatIsoDateTime(contact.updatedAt),
      };
    })
  );

  const fileName = mode === "purchase_summary" ? "contact-master-with-purchases.csv" : "contact-master-export.csv";
  await logReportDownload({
    companyId,
    userId: auth.context?.user?.id,
    reportKey: mode === "purchase_summary" ? "contacts:master_export_with_purchase_summary" : "contacts:master_export",
    reportLabel: mode === "purchase_summary" ? "Contact Master Export With Purchase Summary" : "Contact Master Export",
    filters: `mode=${mode}&status=${status ?? "all"}&search=${search ?? ""}`,
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

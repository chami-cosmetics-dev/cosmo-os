import { NextRequest, NextResponse } from "next/server";

import { logReportDownload } from "@/lib/report-download-log";
import {
  buildPhoneLookupVariants,
  canonicalPhoneForErpCustomerId,
} from "@/lib/phone-lookup";
import { findContactsByPurchasedBrandRanked } from "@/lib/page-data/contact-brand-ids";
import { buildContactsListWhere } from "@/lib/page-data/contacts";
import {
  escapeCsvCell,
  formatCsvHeader,
  formatIsoDate,
  formatIsoDateTime,
  type CsvPrimitive,
} from "@/lib/reports/csv";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ContactStatusFilter = "active" | "inactive" | "never_purchased" | null;
type ContactExportMode = "contacts" | "purchase_summary";

const CONTACT_BATCH_SIZE = 1000;

type ContactExportRow = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  recentMerchant: string | null;
  assignedMerchant: string | null;
  lastPurchaseAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PurchaseSummary = {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
};

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

function phoneMatchKeys(raw: string | null | undefined): string[] {
  const phone = normalizePhone(raw);
  if (!phone) return [];
  const keys = new Set<string>();
  const canonical = canonicalPhoneForErpCustomerId(phone);
  if (canonical) keys.add(canonical);
  for (const variant of buildPhoneLookupVariants(phone)) {
    keys.add(variant);
    const variantCanonical = canonicalPhoneForErpCustomerId(variant);
    if (variantCanonical) keys.add(variantCanonical);
  }
  return [...keys];
}

/**
 * Match orders → contacts by phone without a huge SQL `IN (...)` of every contact variant.
 * Orders are small (~thousands); contacts are large (~tens of thousands).
 */
async function buildPurchaseSummaryByContactId(
  companyId: string,
  contacts: Array<{ id: string; phoneNumber: string | null }>
) {
  const contactIdsByPhoneKey = new Map<string, Set<string>>();
  for (const contact of contacts) {
    for (const key of phoneMatchKeys(contact.phoneNumber)) {
      const ids = contactIdsByPhoneKey.get(key) ?? new Set<string>();
      ids.add(contact.id);
      contactIdsByPhoneKey.set(key, ids);
    }
  }

  if (contactIdsByPhoneKey.size === 0) {
    return new Map<string, PurchaseSummary>();
  }

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      customerPhone: { not: null },
    },
    select: {
      customerPhone: true,
      totalPrice: true,
      createdAt: true,
    },
  });

  const summary = new Map<string, PurchaseSummary>();

  for (const order of orders) {
    const phone = normalizePhone(order.customerPhone);
    if (!phone) continue;

    const matchingContactIds = new Set<string>();
    for (const key of phoneMatchKeys(phone)) {
      const ids = contactIdsByPhoneKey.get(key);
      if (!ids) continue;
      for (const id of ids) matchingContactIds.add(id);
    }
    if (matchingContactIds.size !== 1) continue;

    const [contactId] = matchingContactIds;
    const current = summary.get(contactId) ?? {
      orderCount: 0,
      totalSpent: 0,
      lastOrderAt: null,
    };
    current.orderCount += 1;
    current.totalSpent += Number(order.totalPrice);
    if (!current.lastOrderAt || order.createdAt > current.lastOrderAt) {
      current.lastOrderAt = order.createdAt;
    }
    summary.set(contactId, current);
  }

  return summary;
}

function csvLine(headers: readonly string[], row: Record<string, CsvPrimitive>) {
  return headers.map((header) => escapeCsvCell(row[header])).join(",");
}

async function loadFilteredPhoneRows(
  where: Awaited<ReturnType<typeof buildContactsListWhere>>,
  brandOrderedIds: string[] | null
) {
  const phoneRows: Array<{ id: string; phoneNumber: string | null }> = [];

  if (brandOrderedIds) {
    for (let i = 0; i < brandOrderedIds.length; i += CONTACT_BATCH_SIZE) {
      const idChunk = brandOrderedIds.slice(i, i + CONTACT_BATCH_SIZE);
      const batch = await prisma.contactMaster.findMany({
        where: { ...where, id: { in: idChunk } },
        select: { id: true, phoneNumber: true },
      });
      phoneRows.push(...batch);
    }
    return phoneRows;
  }

  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.contactMaster.findMany({
      where,
      take: CONTACT_BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, phoneNumber: true },
    });
    if (batch.length === 0) break;
    phoneRows.push(...batch);
    cursor = batch[batch.length - 1]!.id;
    if (batch.length < CONTACT_BATCH_SIZE) break;
  }

  return phoneRows;
}

async function* iterateExportContacts(
  where: Awaited<ReturnType<typeof buildContactsListWhere>>,
  brandOrderedIds: string[] | null
): AsyncGenerator<ContactExportRow[]> {
  const select = {
    id: true,
    name: true,
    email: true,
    phoneNumber: true,
    recentMerchant: true,
    assignedMerchant: true,
    lastPurchaseAt: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  if (brandOrderedIds) {
    for (let i = 0; i < brandOrderedIds.length; i += CONTACT_BATCH_SIZE) {
      const idChunk = brandOrderedIds.slice(i, i + CONTACT_BATCH_SIZE);
      const batch = await prisma.contactMaster.findMany({
        where: { ...where, id: { in: idChunk } },
        select,
      });
      const byId = new Map(batch.map((row) => [row.id, row]));
      const ordered = idChunk
        .map((id) => byId.get(id))
        .filter((row): row is ContactExportRow => Boolean(row));
      if (ordered.length > 0) yield ordered;
    }
    return;
  }

  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.contactMaster.findMany({
      where,
      take: CONTACT_BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select,
    });
    if (batch.length === 0) break;
    yield batch;
    cursor = batch[batch.length - 1]!.id;
    if (batch.length < CONTACT_BATCH_SIZE) break;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(["contacts.master.read", "contacts.read"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const status = parseStatus(request.nextUrl.searchParams.get("status"));
  const mode = parseMode(request.nextUrl.searchParams.get("mode"));
  const search = request.nextUrl.searchParams.get("search")?.trim() || null;
  const allocatedTo = request.nextUrl.searchParams.get("allocatedTo")?.trim() || null;
  const brand = request.nextUrl.searchParams.get("brand")?.trim() || null;

  const brandRanks = brand
    ? await findContactsByPurchasedBrandRanked(companyId, brand)
    : [];
  const brandSpendById = new Map(
    brandRanks.map((r) => [r.contactId, r.brandSpend] as const)
  );
  const brandOrderedIds = brand ? brandRanks.map((r) => r.contactId) : null;

  const where = await buildContactsListWhere(
    companyId,
    {
      status,
      search,
      allocatedTo,
      brand,
    },
    { brandContactIds: brand ? brandRanks.map((r) => r.contactId) : undefined }
  );

  const fileName =
    mode === "purchase_summary"
      ? "contact-master-with-purchases.csv"
      : "contact-master-export.csv";

  await logReportDownload({
    companyId,
    userId: auth.context?.user?.id,
    reportKey:
      mode === "purchase_summary"
        ? "contacts:master_export_with_purchase_summary"
        : "contacts:master_export",
    reportLabel:
      mode === "purchase_summary"
        ? "Contact Master Export With Purchase Summary"
        : "Contact Master Export",
    filters: `mode=${mode}&status=${status ?? "all"}&search=${search ?? ""}&allocatedTo=${allocatedTo ?? ""}&brand=${brand ?? ""}`,
    fileName,
  });

  const baseHeaders = [
    "contact_no",
    "name",
    "email",
    "phone_number",
    "recent_merchant",
    "assigned_merchant",
    ...(brand ? (["brand_spend"] as const) : []),
    "last_purchased_date",
    "created_at",
    "updated_at",
  ] as const;

  const purchaseHeaders = [
    "contact_no",
    "name",
    "email",
    "phone_number",
    "recent_merchant",
    "assigned_merchant",
    ...(brand ? (["brand_spend"] as const) : []),
    "total_orders",
    "total_purchase_value",
    "last_order_date",
    "last_purchased_date",
    "created_at",
    "updated_at",
  ] as const;

  const headers = mode === "purchase_summary" ? purchaseHeaders : baseHeaders;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(`\uFEFF${headers.map(formatCsvHeader).join(",")}\r\n`)
        );

        let purchaseSummary: Map<string, PurchaseSummary> | null = null;
        if (mode === "purchase_summary") {
          const phoneRows = await loadFilteredPhoneRows(where, brandOrderedIds);
          purchaseSummary = await buildPurchaseSummaryByContactId(companyId, phoneRows);
        }

        let contactNo = 0;
        for await (const batch of iterateExportContacts(where, brandOrderedIds)) {
          const lines: string[] = [];
          for (const contact of batch) {
            contactNo += 1;
            const summary = purchaseSummary?.get(contact.id);
            const row: Record<string, CsvPrimitive> = {
              contact_no: contactNo,
              name: contact.name,
              email: contact.email ?? "",
              phone_number: contact.phoneNumber ?? "",
              recent_merchant: contact.recentMerchant ?? "",
              assigned_merchant: contact.assignedMerchant ?? "",
              ...(brand
                ? { brand_spend: (brandSpendById.get(contact.id) ?? 0).toFixed(2) }
                : {}),
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
            lines.push(csvLine(headers, row));
          }
          if (lines.length > 0) {
            controller.enqueue(encoder.encode(`${lines.join("\r\n")}\r\n`));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

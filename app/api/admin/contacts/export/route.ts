import { NextRequest, NextResponse } from "next/server";

import {
  loadOrderPurchaseAggregates,
  purchaseSummaryForPhone,
} from "@/lib/contacts/purchase-summary-export";
import { logReportDownload } from "@/lib/report-download-log";
import { findContactsByPurchasedBrandRanked } from "@/lib/page-data/contact-brand-ids";
import { buildContactsListWhere } from "@/lib/page-data/contacts";
import {
  escapeCsvCell,
  formatCsvHeader,
  formatIsoDate,
  formatIsoDateTime,
  type CsvPrimitive,
} from "@/lib/reports/csv";
import { DUMP_TOTAL_HEADER } from "@/lib/reports/dump-download";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ContactStatusFilter = "active" | "inactive" | "never_purchased" | null;
type ContactExportMode = "contacts" | "purchase_summary";

const CONTACT_BATCH_SIZE = 2500;

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

function csvLine(headers: readonly string[], row: Record<string, CsvPrimitive>) {
  return headers.map((header) => escapeCsvCell(row[header])).join(",");
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

  const purchaseSummaryPromise =
    mode === "purchase_summary" ? loadOrderPurchaseAggregates(companyId) : Promise.resolve(null);

  const expectedRows = await prisma.contactMaster.count({ where });

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
    filters: `mode=${mode}&status=${status ?? "all"}&search=${search ?? ""}&allocatedTo=${allocatedTo ?? ""}&brand=${brand ?? ""}&expected=${expectedRows}`,
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

        const purchaseSummaryByPhone = await purchaseSummaryPromise;

        let contactNo = 0;
        for await (const batch of iterateExportContacts(where, brandOrderedIds)) {
          if (request.signal.aborted) {
            throw new Error("Export aborted");
          }
          const lines: string[] = [];
          for (const contact of batch) {
            contactNo += 1;
            const summary = purchaseSummaryByPhone
              ? purchaseSummaryForPhone(purchaseSummaryByPhone, contact.phoneNumber)
              : undefined;
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
        if (contactNo !== expectedRows) {
          throw new Error(`Export incomplete: wrote ${contactNo} of ${expectedRows}`);
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
      [DUMP_TOTAL_HEADER]: String(expectedRows),
      "Access-Control-Expose-Headers": DUMP_TOTAL_HEADER,
    },
  });
}

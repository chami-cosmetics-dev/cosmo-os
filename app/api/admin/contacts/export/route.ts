import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import {
  loadAllocatedMerchantByPhone,
  resolveExportAssignedMerchant,
} from "@/lib/contacts/export-allocated-merchant";
import {
  buildInvoiceHistoryRows,
  INVOICE_HISTORY_HEADERS,
} from "@/lib/contacts/invoice-history-export";
import { getPurchaseSummarySyncStatus } from "@/lib/contacts/purchase-summary-cache";
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
import { loadAssignedMerchantAliasMap } from "@/lib/customer-insight/allocation-summary";
import { formatStoredAllocatedMerchant } from "@/lib/reports/allocated-merchant-format";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Streaming Contact Master CSV (~80k+). Purchase columns and first-purchase date come from cache. */
export const maxDuration = 800;

type ContactStatusFilter = "active" | "inactive" | "never_purchased" | null;
type ContactExportMode = "contacts" | "purchase_summary" | "invoices";

const CONTACT_BATCH_SIZE = 5000;

const contactExportSelect = {
  id: true,
  name: true,
  email: true,
  phoneNumber: true,
  recentMerchant: true,
  assignedMerchant: true,
  lastPurchaseAt: true,
  purchaseOrderCount: true,
  purchaseTotalValue: true,
  purchaseLastOrderAt: true,
  purchaseFirstOrderAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ContactExportRow = Prisma.ContactMasterGetPayload<{ select: typeof contactExportSelect }>;

function parseStatus(value: string | null): ContactStatusFilter {
  if (value === "active" || value === "inactive" || value === "never_purchased") {
    return value;
  }
  return null;
}

function parseMode(value: string | null): ContactExportMode {
  if (value === "purchase_summary") return "purchase_summary";
  if (value === "invoices") return "invoices";
  return "contacts";
}

function csvLine(headers: readonly string[], row: Record<string, CsvPrimitive>) {
  return headers.map((header) => escapeCsvCell(row[header])).join(",");
}

function toAmount(value: { toString(): string } | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(n) ? n : 0;
}

async function fetchContactBatch(
  where: Awaited<ReturnType<typeof buildContactsListWhere>>,
  cursor: string | undefined
): Promise<ContactExportRow[]> {
  return prisma.contactMaster.findMany({
    where,
    take: CONTACT_BATCH_SIZE,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { id: "asc" },
    select: contactExportSelect,
  });
}

async function fetchBrandOrderedChunk(
  where: Awaited<ReturnType<typeof buildContactsListWhere>>,
  brandOrderedIds: string[],
  start: number
): Promise<ContactExportRow[]> {
  const idChunk = brandOrderedIds.slice(start, start + CONTACT_BATCH_SIZE);
  if (idChunk.length === 0) return [];
  const batch = await prisma.contactMaster.findMany({
    where: { ...where, id: { in: idChunk } },
    select: contactExportSelect,
  });
  const byId = new Map(batch.map((row) => [row.id, row] as const));
  const ordered: ContactExportRow[] = [];
  for (const id of idChunk) {
    const row = byId.get(id);
    if (row) ordered.push(row);
  }
  return ordered;
}

/** Latest call-update author per contact. One indexed scan, not a join on every export page. */
async function loadLatestUpdaterByContactId(companyId: string): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<
    Array<{ contactId: string; merchantName: string | null }>
  >`
    SELECT DISTINCT ON ("contactId") "contactId", "merchantName"
    FROM "ContactAllocationUpdate"
    WHERE "companyId" = ${companyId}
      AND "category" <> 'allocation'
    ORDER BY "contactId", "createdAt" DESC
  `;
  const map = new Map<string, string>();
  for (const row of rows) {
    const name = row.merchantName?.trim();
    if (name) map.set(row.contactId, name);
  }
  return map;
}

/** Yield contact batches. Prefetch next DB page while caller encodes the current one. */
async function* iterateExportContacts(
  where: Awaited<ReturnType<typeof buildContactsListWhere>>,
  brandOrderedIds: string[] | null
): AsyncGenerator<ContactExportRow[]> {
  if (brandOrderedIds) {
    let start = 0;
    let pending = fetchBrandOrderedChunk(where, brandOrderedIds, start);
    start += CONTACT_BATCH_SIZE;
    for (;;) {
      const ordered = await pending;
      const hasMore = start < brandOrderedIds.length;
      pending = hasMore
        ? fetchBrandOrderedChunk(where, brandOrderedIds, start)
        : Promise.resolve([]);
      start += CONTACT_BATCH_SIZE;
      if (ordered.length > 0) yield ordered;
      if (!hasMore) break;
    }
    return;
  }

  let pending = fetchContactBatch(where, undefined);
  for (;;) {
    const batch = await pending;
    if (batch.length === 0) break;
    const nextCursor = batch[batch.length - 1]!.id;
    const hasMore = batch.length === CONTACT_BATCH_SIZE;
    pending = hasMore ? fetchContactBatch(where, nextCursor) : Promise.resolve([]);
    yield batch;
    if (!hasMore) break;
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

  if (mode === "purchase_summary") {
    const sync = await getPurchaseSummarySyncStatus(companyId);
    if (!sync.lastSyncedAt) {
      return NextResponse.json(
        {
          error:
            "Purchase summary cache not built yet. Click Refresh purchase totals, then export again.",
        },
        { status: 409 }
      );
    }
  }

  const brandRanks = brand
    ? await findContactsByPurchasedBrandRanked(companyId, brand)
    : [];
  const brandSpendById = new Map(
    brandRanks.map((r) => [r.contactId, r.brandSpend] as const)
  );
  const brandOrderedIds = brand ? brandRanks.map((r) => r.contactId) : null;

  if (mode === "invoices") {
    return streamInvoiceHistoryExport({
      companyId,
      userId: auth.context?.user?.id,
      where: await buildContactsListWhere(
        companyId,
        { status, search, allocatedTo, brand },
        { brandContactIds: brand ? brandRanks.map((r) => r.contactId) : undefined },
      ),
      brandOrderedIds,
      filters: `mode=${mode}&status=${status ?? "all"}&search=${search ?? ""}&allocatedTo=${allocatedTo ?? ""}&brand=${brand ?? ""}`,
    });
  }

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

  const [expectedRows, allocatedByPhone, aliasToRoster, updatedByContactId] = await Promise.all([
    prisma.contactMaster.count({ where }),
    loadAllocatedMerchantByPhone(companyId),
    loadAssignedMerchantAliasMap(companyId),
    loadLatestUpdaterByContactId(companyId),
  ]);

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
    "first_purchased_date",
    "created_at",
    "updated_at",
    "updated_by",
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
    "first_purchased_date",
    "created_at",
    "updated_at",
    "updated_by",
  ] as const;

  const headers = mode === "purchase_summary" ? purchaseHeaders : baseHeaders;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(`\uFEFF${headers.map(formatCsvHeader).join(",")}\r\n`)
        );

        let contactNo = 0;
        for await (const batch of iterateExportContacts(where, brandOrderedIds)) {
          if (request.signal.aborted) {
            throw new Error("Export aborted");
          }
          const lines: string[] = [];
          for (const contact of batch) {
            contactNo += 1;
            const purchaseLast = contact.purchaseLastOrderAt;
            const purchaseTotal = toAmount(contact.purchaseTotalValue);
            const row: Record<string, CsvPrimitive> = {
              contact_no: contactNo,
              name: contact.name,
              email: contact.email ?? "",
              phone_number: contact.phoneNumber ?? "",
              recent_merchant: formatStoredAllocatedMerchant(
                contact.recentMerchant,
                aliasToRoster
              ),
              assigned_merchant: formatStoredAllocatedMerchant(
                resolveExportAssignedMerchant(
                  contact.assignedMerchant,
                  [contact.phoneNumber],
                  allocatedByPhone
                ),
                aliasToRoster
              ),
              ...(brand
                ? { brand_spend: (brandSpendById.get(contact.id) ?? 0).toFixed(2) }
                : {}),
              ...(mode === "purchase_summary"
                ? {
                    total_orders: contact.purchaseOrderCount,
                    total_purchase_value: purchaseTotal.toFixed(2),
                    last_order_date: formatIsoDate(purchaseLast),
                  }
                : {}),
              last_purchased_date: formatIsoDate(
                purchaseLast &&
                  (!contact.lastPurchaseAt || purchaseLast > contact.lastPurchaseAt)
                  ? purchaseLast
                  : contact.lastPurchaseAt
              ),
              first_purchased_date: formatIsoDate(contact.purchaseFirstOrderAt),
              created_at: formatIsoDateTime(contact.createdAt),
              updated_at: formatIsoDateTime(contact.updatedAt),
              updated_by: formatStoredAllocatedMerchant(
                updatedByContactId.get(contact.id),
                aliasToRoster
              ),
            };
            lines.push(csvLine(headers, row));
          }
          if (lines.length > 0) {
            controller.enqueue(encoder.encode(`${lines.join("\r\n")}\r\n`));
          }
        }
        if (contactNo < expectedRows) {
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

const INVOICE_CONTACT_BATCH = 100;

type InvoiceExportContact = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
};

async function streamInvoiceHistoryExport(input: {
  companyId: string;
  userId: string | undefined;
  where: Awaited<ReturnType<typeof buildContactsListWhere>>;
  brandOrderedIds: string[] | null;
  filters: string;
}) {
  await logReportDownload({
    companyId: input.companyId,
    userId: input.userId,
    reportKey: "contacts:master_export_with_invoices",
    reportLabel: "Contact Master Export With Invoices",
    filters: input.filters,
    fileName: "contact-master-with-invoices.csv",
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(`\uFEFF${INVOICE_HISTORY_HEADERS.map(formatCsvHeader).join(",")}\r\n`),
        );
        for await (const batch of iterateInvoiceContacts(input.where, input.brandOrderedIds)) {
          const lines = await invoiceLinesForContacts(input.companyId, batch);
          if (lines.length > 0) controller.enqueue(encoder.encode(`${lines.join("\r\n")}\r\n`));
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
      "Content-Disposition": 'attachment; filename="contact-master-with-invoices.csv"',
      "Cache-Control": "no-store",
    },
  });
}

async function* iterateInvoiceContacts(
  where: Awaited<ReturnType<typeof buildContactsListWhere>>,
  brandOrderedIds: string[] | null,
): AsyncGenerator<InvoiceExportContact[]> {
  const select = {
    id: true,
    name: true,
    email: true,
    phoneNumber: true,
  } as const;

  if (brandOrderedIds) {
    for (let start = 0; start < brandOrderedIds.length; start += INVOICE_CONTACT_BATCH) {
      const idChunk = brandOrderedIds.slice(start, start + INVOICE_CONTACT_BATCH);
      const batch = await prisma.contactMaster.findMany({
        where: { ...where, id: { in: idChunk } },
        select,
      });
      const byId = new Map(batch.map((row) => [row.id, row] as const));
      const ordered = idChunk.flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
      });
      if (ordered.length > 0) yield ordered;
    }
    return;
  }

  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.contactMaster.findMany({
      where,
      take: INVOICE_CONTACT_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select,
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;
    yield batch;
    if (batch.length < INVOICE_CONTACT_BATCH) break;
  }
}

async function invoiceLinesForContacts(companyId: string, contacts: InvoiceExportContact[]) {
  const ids = contacts.map((contact) => contact.id);
  const adaptRows = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId, contactId: { in: ids } },
    select: {
      contactId: true,
      salesInvoiceNo: true,
      invoiceDate: true,
      financialStatus: true,
      paymentMethod: true,
      origin: true,
      importBatchId: true,
      lineItems: true,
    },
  });

  const adaptByContact = new Map<string, typeof adaptRows>();
  for (const row of adaptRows) {
    const list = adaptByContact.get(row.contactId) ?? [];
    list.push(row);
    adaptByContact.set(row.contactId, list);
  }

  const lines: string[] = [];
  for (const contact of contacts) {
    const rows = buildInvoiceHistoryRows({
      contact,
      adaptInvoices: adaptByContact.get(contact.id) ?? [],
    });
    for (const row of rows) lines.push(csvLine(INVOICE_HISTORY_HEADERS, row));
  }
  return lines;
}

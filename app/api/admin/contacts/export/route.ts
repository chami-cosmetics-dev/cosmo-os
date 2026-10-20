import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { contactOrderLookupKeys } from "@/lib/contact-purchase-lookup";
import {
  loadAllocatedMerchantByPhone,
  resolveExportAssignedMerchant,
} from "@/lib/contacts/export-allocated-merchant";
import { phoneMatchKeys } from "@/lib/contacts/purchase-summary-export";
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
import {
  DUMP_HAS_MORE_HEADER,
  DUMP_NEXT_CURSOR_HEADER,
  DUMP_PAGE_CONTACTS_HEADER,
  DUMP_TOTAL_HEADER,
  dumpExposeHeaders,
} from "@/lib/reports/dump-download";
import { loadAssignedMerchantAliasMap } from "@/lib/customer-insight/allocation-summary";
import { formatStoredAllocatedMerchant } from "@/lib/reports/allocated-merchant-format";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** One page of Contact Master CSV. Client concatenates pages so a proxy cannot cut the file at ~30k rows. */
export const maxDuration = 300;

type ContactStatusFilter = "active" | "inactive" | "never_purchased" | null;
type ContactExportMode = "contacts" | "purchase_summary" | "invoices";

/** Stay under Vercel’s ~4.5MB buffered response cap (88k rows ≈ 23 pages). */
const CONTACT_EXPORT_PAGE_SIZE = 4000;
const INVOICE_EXPORT_PAGE_SIZE = 80;

const contactExportSelect = {
  id: true,
  name: true,
  email: true,
  phoneNumber: true,
  address: true,
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

function parseNonNegInt(value: string | null, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

async function fetchBrandOrderedChunk(
  where: Awaited<ReturnType<typeof buildContactsListWhere>>,
  brandOrderedIds: string[],
  start: number,
  pageSize: number
): Promise<ContactExportRow[]> {
  const idChunk = brandOrderedIds.slice(start, start + pageSize);
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

async function fetchContactExportPage(
  where: Awaited<ReturnType<typeof buildContactsListWhere>>,
  brandOrderedIds: string[] | null,
  after: string | null,
  offset: number,
  pageSize: number
): Promise<{ rows: ContactExportRow[]; hasMore: boolean; nextCursor: string }> {
  if (brandOrderedIds) {
    const idChunk = brandOrderedIds.slice(offset, offset + pageSize);
    const rows = await fetchBrandOrderedChunk(where, brandOrderedIds, offset, pageSize);
    return {
      rows,
      hasMore: offset + idChunk.length < brandOrderedIds.length,
      nextCursor: idChunk.at(-1) ?? "",
    };
  }

  const batch = await prisma.contactMaster.findMany({
    where,
    take: pageSize + 1,
    ...(after ? { skip: 1, cursor: { id: after } } : {}),
    orderBy: { id: "asc" },
    select: contactExportSelect,
  });
  const hasMore = batch.length > pageSize;
  const rows = hasMore ? batch.slice(0, pageSize) : batch;
  return {
    rows,
    hasMore,
    nextCursor: rows.at(-1)?.id ?? "",
  };
}

/** Latest call-update author for this page only. */
async function loadLatestUpdaterByContactIds(
  companyId: string,
  contactIds: string[]
): Promise<Map<string, string>> {
  if (contactIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<
    Array<{ contactId: string; merchantName: string | null }>
  >`
    SELECT DISTINCT ON ("contactId") "contactId", "merchantName"
    FROM "ContactAllocationUpdate"
    WHERE "companyId" = ${companyId}
      AND "contactId" IN (${Prisma.join(contactIds)})
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

function encodeCsvPage(
  headers: readonly string[],
  lines: string[],
  includeHeader: boolean
) {
  const out: string[] = [];
  if (includeHeader) {
    out.push(headers.map(formatCsvHeader).join(","));
  }
  out.push(...lines);
  const body = out.length > 0 ? `${out.join("\r\n")}\r\n` : "";
  return includeHeader ? `\uFEFF${body}` : body;
}

function csvPageResponse(input: {
  csv: string;
  fileName: string;
  expectedRows: number;
  hasMore: boolean;
  nextCursor: string;
  pageContacts: number;
}) {
  return new NextResponse(input.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${input.fileName}"`,
      "Cache-Control": "no-store",
      [DUMP_TOTAL_HEADER]: String(input.expectedRows),
      [DUMP_HAS_MORE_HEADER]: input.hasMore ? "1" : "0",
      [DUMP_NEXT_CURSOR_HEADER]: input.nextCursor,
      [DUMP_PAGE_CONTACTS_HEADER]: String(input.pageContacts),
      "Access-Control-Expose-Headers": dumpExposeHeaders(),
    },
  });
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
  const after = request.nextUrl.searchParams.get("after")?.trim() || null;
  const pageIndex = parseNonNegInt(request.nextUrl.searchParams.get("page"), 0);
  const startNo = Math.max(1, parseNonNegInt(request.nextUrl.searchParams.get("start"), 1));
  const includeHeader = request.nextUrl.searchParams.get("header") !== "0";
  const isFirstPage = pageIndex === 0 && !after;
  const contactOffset = pageIndex * CONTACT_EXPORT_PAGE_SIZE;
  const invoiceOffset = pageIndex * INVOICE_EXPORT_PAGE_SIZE;

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

  if (mode === "invoices") {
    return invoiceHistoryExportPage({
      companyId,
      userId: auth.context?.user?.id,
      where,
      brandOrderedIds,
      after,
      offset: invoiceOffset,
      includeHeader,
      isFirstPage,
      filters: `mode=${mode}&status=${status ?? "all"}&search=${search ?? ""}&allocatedTo=${allocatedTo ?? ""}&brand=${brand ?? ""}`,
    });
  }

  const fileName =
    mode === "purchase_summary"
      ? "contact-master-with-purchases.csv"
      : "contact-master-export.csv";

  const [expectedRows, page, aliasToRoster] = await Promise.all([
    isFirstPage ? prisma.contactMaster.count({ where }) : Promise.resolve(0),
    fetchContactExportPage(
      where,
      brandOrderedIds,
      brandOrderedIds ? null : after,
      contactOffset,
      CONTACT_EXPORT_PAGE_SIZE
    ),
    loadAssignedMerchantAliasMap(companyId),
  ]);

  const unallocatedPhones = page.rows
    .filter((contact) => !contact.assignedMerchant?.trim())
    .map((contact) => contact.phoneNumber);
  const includeUpdatedBy = mode === "purchase_summary";
  const [allocatedByPhone, updatedByContactId] = await Promise.all([
    loadAllocatedMerchantByPhone(companyId, unallocatedPhones),
    includeUpdatedBy
      ? loadLatestUpdaterByContactIds(
          companyId,
          page.rows.map((contact) => contact.id)
        )
      : Promise.resolve(new Map<string, string>()),
  ]);

  if (isFirstPage) {
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
  }

  const baseHeaders = [
    "contact_no",
    "name",
    "email",
    "phone_number",
    "address",
    "recent_merchant",
    "assigned_merchant",
    "order_value",
    ...(brand ? (["brand_spend"] as const) : []),
    "last_purchased_date",
    "first_purchased_date",
    "created_at",
    "updated_at",
    ...(includeUpdatedBy ? (["updated_by"] as const) : []),
  ] as const;

  const purchaseHeaders = [
    "contact_no",
    "name",
    "email",
    "phone_number",
    "address",
    "recent_merchant",
    "assigned_merchant",
    "order_value",
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
  const lines: string[] = [];
  let contactNo = startNo - 1;
  for (const contact of page.rows) {
    contactNo += 1;
    const purchaseLast = contact.purchaseLastOrderAt;
    const purchaseTotal = toAmount(contact.purchaseTotalValue);
    const row: Record<string, CsvPrimitive> = {
      contact_no: contactNo,
      name: contact.name,
      email: contact.email ?? "",
      phone_number: contact.phoneNumber ?? "",
      address: contact.address ?? "",
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
      order_value: purchaseTotal.toFixed(2),
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
      ...(includeUpdatedBy
        ? {
            updated_by: formatStoredAllocatedMerchant(
              updatedByContactId.get(contact.id),
              aliasToRoster
            ),
          }
        : {}),
    };
    lines.push(csvLine(headers, row));
  }

  return csvPageResponse({
    csv: encodeCsvPage(headers, lines, includeHeader),
    fileName,
    expectedRows,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    pageContacts: page.rows.length,
  });
}

type InvoiceExportContact = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  phones: { phoneNumber: string }[];
  emails: { email: string }[];
};

const invoiceContactSelect = {
  id: true,
  name: true,
  email: true,
  phoneNumber: true,
  phones: { select: { phoneNumber: true } },
  emails: { select: { email: true } },
} as const;

async function fetchInvoiceContactPage(
  where: Awaited<ReturnType<typeof buildContactsListWhere>>,
  brandOrderedIds: string[] | null,
  after: string | null,
  offset: number
): Promise<{ rows: InvoiceExportContact[]; hasMore: boolean; nextCursor: string }> {
  if (brandOrderedIds) {
    const idChunk = brandOrderedIds.slice(offset, offset + INVOICE_EXPORT_PAGE_SIZE);
    if (idChunk.length === 0) {
      return { rows: [], hasMore: false, nextCursor: "" };
    }
    const batch = await prisma.contactMaster.findMany({
      where: { ...where, id: { in: idChunk } },
      select: invoiceContactSelect,
    });
    const byId = new Map(batch.map((row) => [row.id, row] as const));
    const rows = idChunk.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
    return {
      rows,
      hasMore: offset + idChunk.length < brandOrderedIds.length,
      nextCursor: idChunk.at(-1) ?? "",
    };
  }

  const batch = await prisma.contactMaster.findMany({
    where,
    take: INVOICE_EXPORT_PAGE_SIZE + 1,
    ...(after ? { skip: 1, cursor: { id: after } } : {}),
    orderBy: { id: "asc" },
    select: invoiceContactSelect,
  });
  const hasMore = batch.length > INVOICE_EXPORT_PAGE_SIZE;
  const rows = hasMore ? batch.slice(0, INVOICE_EXPORT_PAGE_SIZE) : batch;
  return {
    rows,
    hasMore,
    nextCursor: rows.at(-1)?.id ?? "",
  };
}

async function invoiceHistoryExportPage(input: {
  companyId: string;
  userId: string | undefined;
  where: Awaited<ReturnType<typeof buildContactsListWhere>>;
  brandOrderedIds: string[] | null;
  after: string | null;
  offset: number;
  includeHeader: boolean;
  isFirstPage: boolean;
  filters: string;
}) {
  const fileName = "contact-master-with-invoices.csv";
  const [expectedRows, page] = await Promise.all([
    input.isFirstPage ? prisma.contactMaster.count({ where: input.where }) : Promise.resolve(0),
    fetchInvoiceContactPage(
      input.where,
      input.brandOrderedIds,
      input.brandOrderedIds ? null : input.after,
      input.offset
    ),
  ]);

  if (input.isFirstPage) {
    await logReportDownload({
      companyId: input.companyId,
      userId: input.userId,
      reportKey: "contacts:master_export_with_invoices",
      reportLabel: "Contact Master Export With Invoices",
      filters: `${input.filters}&expected=${expectedRows}`,
      fileName,
    });
  }

  const lines =
    page.rows.length > 0 ? await invoiceLinesForContacts(input.companyId, page.rows) : [];

  return csvPageResponse({
    csv: encodeCsvPage(INVOICE_HISTORY_HEADERS, lines, input.includeHeader),
    fileName,
    expectedRows,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    pageContacts: page.rows.length,
  });
}

async function invoiceLinesForContacts(companyId: string, contacts: InvoiceExportContact[]) {
  const ids = contacts.map((contact) => contact.id);
  const byPhone = new Map<string, InvoiceExportContact>();
  const byEmail = new Map<string, InvoiceExportContact>();
  const phoneList: string[] = [];
  const emailList: string[] = [];

  for (const contact of contacts) {
    const keys = contactOrderLookupKeys({
      primaryPhone: contact.phoneNumber,
      primaryEmail: contact.email,
      aliasPhones: contact.phones.map((phone) => phone.phoneNumber),
      aliasEmails: contact.emails.map((email) => email.email),
    });
    for (const phone of keys.phones) {
      phoneList.push(phone);
      for (const key of phoneMatchKeys(phone)) {
        if (!byPhone.has(key)) byPhone.set(key, contact);
      }
    }
    for (const email of keys.emails) {
      const normalized = email.trim().toLowerCase();
      if (!normalized || byEmail.has(normalized)) continue;
      byEmail.set(normalized, contact);
      emailList.push(normalized);
    }
  }

  const orderOr: Prisma.OrderWhereInput[] = [];
  if (phoneList.length > 0) {
    orderOr.push({ customerPhone: { in: phoneList } }, { erpnextCustomerId: { in: phoneList } });
  }
  if (emailList.length > 0) {
    orderOr.push({ customerEmail: { in: emailList, mode: "insensitive" } });
  }

  const [adaptRows, orders] = await Promise.all([
    prisma.adaptPurchaseHistory.findMany({
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
    }),
    orderOr.length > 0
      ? prisma.order.findMany({
          where: { companyId, OR: orderOr },
          select: {
            id: true,
            orderNumber: true,
            name: true,
            erpnextInvoiceId: true,
            createdAt: true,
            financialStatus: true,
            customerPhone: true,
            customerEmail: true,
            erpnextCustomerId: true,
            lineItems: {
              select: {
                quantity: true,
                price: true,
                productItem: { select: { sku: true, productTitle: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const adaptByContact = new Map<string, typeof adaptRows>();
  for (const row of adaptRows) {
    const list = adaptByContact.get(row.contactId) ?? [];
    list.push(row);
    adaptByContact.set(row.contactId, list);
  }

  const ordersByContact = new Map<string, typeof orders>();
  for (const order of orders) {
    let contact: InvoiceExportContact | null = null;
    for (const raw of [order.customerPhone, order.erpnextCustomerId]) {
      if (contact) break;
      for (const key of phoneMatchKeys(raw)) {
        const hit = byPhone.get(key);
        if (hit) {
          contact = hit;
          break;
        }
      }
    }
    if (!contact && order.customerEmail?.trim()) {
      contact = byEmail.get(order.customerEmail.trim().toLowerCase()) ?? null;
    }
    if (!contact) continue;
    const list = ordersByContact.get(contact.id) ?? [];
    list.push(order);
    ordersByContact.set(contact.id, list);
  }

  const lines: string[] = [];
  for (const contact of contacts) {
    const rows = buildInvoiceHistoryRows({
      contact,
      adaptInvoices: adaptByContact.get(contact.id) ?? [],
      orders: (ordersByContact.get(contact.id) ?? []).map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        name: order.name,
        erpnextInvoiceId: order.erpnextInvoiceId,
        createdAt: order.createdAt,
        financialStatus: order.financialStatus,
        lineItems: order.lineItems.map((line) => ({
          quantity: line.quantity,
          price: line.price.toString(),
          sku: line.productItem.sku,
          productTitle: line.productItem.productTitle,
        })),
      })),
    });
    for (const row of rows) lines.push(csvLine(INVOICE_HISTORY_HEADERS, row));
  }
  return lines;
}

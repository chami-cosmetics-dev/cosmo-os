import { NextRequest, NextResponse } from "next/server";

import {
  listMerchantAllocationCounts,
  listMerchantPurchaseCountSummary,
  loadAssignedMerchantAliasMap,
  resolveAllocatedMerchant,
  uniqueContactPhones,
  type PurchaseCountFilter,
} from "@/lib/customer-insight/allocation-summary";
import { firstPurchaseAtForLoadedContacts } from "@/lib/customer-insight/first-purchase";
import { resolveAssignedMerchantFilterLabels } from "@/lib/customer-insight/merchant-label-aliases";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { prisma } from "@/lib/prisma";
import { formatAllocatedMerchantExport } from "@/lib/reports/allocated-merchant-format";
import { logReportDownload } from "@/lib/report-download-log";
import { requirePermission } from "@/lib/rbac";
import {
  DUMP_HAS_MORE_HEADER,
  DUMP_NEXT_CURSOR_HEADER,
  DUMP_PAGE_CONTACTS_HEADER,
  DUMP_TOTAL_HEADER,
  dumpExposeHeaders,
} from "@/lib/reports/dump-download";
import {
  buildCsv,
  escapeCsvCell,
  formatCsvHeader,
  formatIsoDate,
  type CsvPrimitive,
} from "@/lib/reports/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Contacts export is paged; 800s kept for purchase-performance on this same route. */
export const maxDuration = 800;

/** Stay under Vercel’s ~4.5MB buffered response cap (85k allocated ≈ 22 pages). */
const ALLOCATION_CONTACTS_EXPORT_PAGE_SIZE = 4000;

const CONTACT_EXPORT_HEADERS = [
  "merchant",
  "name",
  "phone_number",
  "extra_phones",
  "first_purchased_date",
] as const;

type AllocationContactExportRow = Record<
  (typeof CONTACT_EXPORT_HEADERS)[number],
  CsvPrimitive
>;

function parseDateRange(
  searchParams: URLSearchParams
): { from: Date; to: Date } | null {
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  if (!fromRaw || !toRaw) return null;

  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;

  to.setUTCHours(23, 59, 59, 999);

  return { from, to };
}

function parsePurchaseCountFilter(
  searchParams: URLSearchParams
): PurchaseCountFilter {
  const preset = searchParams.get("purchasePreset");

  if (preset === "custom") {
    const fromRaw = searchParams.get("purchaseFrom");
    const toRaw = searchParams.get("purchaseTo");
    if (fromRaw && toRaw) {
      const from = new Date(fromRaw);
      const to = new Date(toRaw);
      if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
        to.setUTCHours(23, 59, 59, 999);
        return { preset: "custom", from, to };
      }
    }
  } else if (
    preset === "today" ||
    preset === "1-30" ||
    preset === "31-90" ||
    preset === "91-180" ||
    preset === "181-365" ||
    preset === "over-365"
  ) {
    return { preset };
  }

  return { preset: "today" };
}

function parseNonNegInt(value: string | null, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
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

async function exportAllocatedContactsCsv(
  request: NextRequest,
  companyId: string,
  userId: string,
  assignedMerchant: string
): Promise<NextResponse> {
  const merchantNeedle = assignedMerchant.trim();
  const after = request.nextUrl.searchParams.get("after")?.trim() || null;
  const pageIndex = parseNonNegInt(request.nextUrl.searchParams.get("page"), 0);
  const includeHeader = request.nextUrl.searchParams.get("header") !== "0";
  const isFirstPage = pageIndex === 0 && !after;

  // No merchant picked = every allocated contact, across all merchants.
  const aliases = merchantNeedle
    ? await resolveAssignedMerchantFilterLabels(companyId, merchantNeedle)
    : [];
  const merchantWhere = !merchantNeedle
    ? {}
    : aliases.length <= 1
      ? {
          assignedMerchant: {
            equals: aliases[0] ?? merchantNeedle,
            mode: "insensitive" as const,
          },
        }
      : {
          OR: aliases.map((alias) => ({
            assignedMerchant: {
              equals: alias,
              mode: "insensitive" as const,
            },
          })),
        };

  const where = {
    companyId,
    AND: [{ assignedMerchant: { not: "" } }, merchantWhere],
  };

  const safeSlug = merchantNeedle
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const fileName = merchantNeedle
    ? `insight-merchant-allocation-contacts-${safeSlug || "merchant"}.csv`
    : "insight-merchant-allocation-contacts-all.csv";

  const [expectedRows, batch, aliasToRoster] = await Promise.all([
    isFirstPage ? prisma.contactMaster.count({ where }) : Promise.resolve(0),
    prisma.contactMaster.findMany({
      where,
      take: ALLOCATION_CONTACTS_EXPORT_PAGE_SIZE + 1,
      ...(after ? { skip: 1, cursor: { id: after } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        assignedMerchant: true,
        phones: { select: { phoneNumber: true } },
        emails: { select: { email: true } },
      },
    }),
    loadAssignedMerchantAliasMap(companyId),
  ]);

  const hasMore = batch.length > ALLOCATION_CONTACTS_EXPORT_PAGE_SIZE;
  const pageRows = hasMore
    ? batch.slice(0, ALLOCATION_CONTACTS_EXPORT_PAGE_SIZE)
    : batch;
  const firstPurchaseById = await firstPurchaseAtForLoadedContacts(
    companyId,
    pageRows
  );

  if (isFirstPage) {
    await logReportDownload({
      companyId,
      userId,
      reportKey: "customer_insight:allocation_contacts",
      reportLabel: "Customer Insight Allocation Contacts",
      filters: merchantNeedle
        ? `assignedMerchant=${merchantNeedle}&expected=${expectedRows}`
        : `assignedMerchant=all&expected=${expectedRows}`,
      fileName,
    });
  }

  const lines: string[] = [];
  for (const contact of pageRows) {
    const raw = contact.assignedMerchant?.trim() ?? "";
    if (!raw) continue;
    const merchant = resolveAllocatedMerchant(raw, aliasToRoster);
    const phones = uniqueContactPhones(contact.phoneNumber, contact.phones);
    const row: AllocationContactExportRow = {
      merchant: formatAllocatedMerchantExport(merchant.label, merchant.value),
      name: contact.name,
      phone_number: phones[0] ?? "",
      extra_phones: phones.slice(1).join("; "),
      first_purchased_date: formatIsoDate(firstPurchaseById.get(contact.id)),
    };
    lines.push(
      CONTACT_EXPORT_HEADERS.map((header) => escapeCsvCell(row[header])).join(
        ","
      )
    );
  }

  return new NextResponse(
    encodeCsvPage(CONTACT_EXPORT_HEADERS, lines, includeHeader),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        [DUMP_TOTAL_HEADER]: String(expectedRows),
        [DUMP_HAS_MORE_HEADER]: hasMore ? "1" : "0",
        [DUMP_NEXT_CURSOR_HEADER]: pageRows.at(-1)?.id ?? "",
        [DUMP_PAGE_CONTACTS_HEADER]: String(pageRows.length),
        "Access-Control-Expose-Headers": dumpExposeHeaders(),
      },
    }
  );
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

  const { searchParams } = new URL(request.url);
  if (searchParams.get("format") === "contacts") {
    const assignedMerchant = (searchParams.get("assignedMerchant") ?? "").trim();
    return exportAllocatedContactsCsv(
      request,
      companyId,
      user.id,
      assignedMerchant
    );
  }

  const report =
    searchParams.get("report") === "purchase-performance"
      ? "purchase-performance"
      : "data-collection";

  let headers: readonly string[];
  let rows: Array<Record<string, CsvPrimitive>>;
  let fileName: string;

  if (report === "purchase-performance") {
    const purchaseCountFilter = parsePurchaseCountFilter(searchParams);
    const purchaseCountSummary = await listMerchantPurchaseCountSummary(
      companyId,
      purchaseCountFilter
    );

    fileName = "insight-merchant-purchase-performance.csv";
    headers = [
      "merchant",
      "platinum",
      "gold",
      "other",
      "total",
      "purchase_platinum",
      "purchase_gold",
      "purchase_other",
      "purchase_total",
      "purchased_via_merchant",
      "purchased_via_merchant_pct",
      "purchased_via_other",
      "purchased_via_other_pct",
    ];
    rows = purchaseCountSummary.rows.map((r) => ({
      merchant: formatAllocatedMerchantExport(r.merchantLabel, r.merchantValue),
      platinum: r.allocation.platinum,
      gold: r.allocation.gold,
      other: r.allocation.other,
      total: r.allocation.total,
      purchase_platinum: r.purchaseCount.platinum,
      purchase_gold: r.purchaseCount.gold,
      purchase_other: r.purchaseCount.other,
      purchase_total: r.purchaseCount.total,
      purchased_via_merchant: r.purchaseChannel.byMerchant,
      purchased_via_merchant_pct: r.purchaseChannel.byMerchantPercent,
      purchased_via_other: r.purchaseChannel.byOther,
      purchased_via_other_pct: r.purchaseChannel.byOtherPercent,
    }));
  } else {
    const dateRange = parseDateRange(searchParams);
    const summary = await listMerchantAllocationCounts(
      companyId,
      dateRange ?? undefined
    );

    fileName = "insight-merchant-data-collection.csv";
    const baseHeaders = [
      "merchant",
      "platinum",
      "gold",
      "other",
      "total",
    ] as const;
    const rangeHeaders = [
      "calls_taken",
      "birthday_count",
      "birthday_percent",
      "email_count",
      "email_percent",
    ] as const;
    const completeHeaders = ["complete_count", "complete_percent"] as const;
    headers = [
      ...baseHeaders,
      ...(dateRange ? rangeHeaders : []),
      ...completeHeaders,
    ];

    rows = [
      ...summary.rows.map((r) => ({
        merchant: formatAllocatedMerchantExport(r.merchantLabel, r.merchantValue),
        platinum: r.platinum,
        gold: r.gold,
        other: r.other,
        total: r.total,
        ...(dateRange
          ? {
              calls_taken: r.dateRangeStats?.callsTaken ?? 0,
              birthday_count: r.dateRangeStats?.birthdayCount ?? 0,
              birthday_percent: r.dateRangeStats?.birthdayPercent ?? 0,
              email_count: r.dateRangeStats?.emailCount ?? 0,
              email_percent: r.dateRangeStats?.emailPercent ?? 0,
            }
          : {}),
        complete_count: r.completeCount,
        complete_percent: r.completePercent,
      })),
      {
        merchant: "Unallocated",
        platinum: "",
        gold: "",
        other: "",
        total: summary.unallocatedCount,
        ...(dateRange
          ? {
              calls_taken: "",
              birthday_count: "",
              birthday_percent: "",
              email_count: "",
              email_percent: "",
            }
          : {}),
        complete_count: "",
        complete_percent: "",
      },
    ];
  }

  await logReportDownload({
    companyId,
    userId: user.id,
    reportKey: "customer_insight:allocation_summary",
    reportLabel: "Customer Insight Allocation Summary",
    fileName,
  });

  const csv = buildCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

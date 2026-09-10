import { NextRequest, NextResponse } from "next/server";

import {
  ALLOCATION_EXPORT_BATCH_SIZE,
  listMerchantAllocationCounts,
  listMerchantPurchaseCountSummary,
  loadAssignedMerchantAliasMap,
  resolveAllocatedMerchant,
  uniqueContactPhones,
  type PurchaseCountFilter,
} from "@/lib/customer-insight/allocation-summary";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { prisma } from "@/lib/prisma";
import { logReportDownload } from "@/lib/report-download-log";
import { requirePermission } from "@/lib/rbac";
import {
  buildCsv,
  formatCsvDataLine,
  formatCsvHeaderLine,
  type CsvPrimitive,
} from "@/lib/reports/csv";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONTACT_EXPORT_HEADERS = [
  "merchant",
  "merchant_value",
  "name",
  "phone_number",
  "extra_phones",
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

async function exportAllocatedContactsCsv(
  companyId: string,
  userId: string
): Promise<NextResponse> {
  const fileName = "insight-merchant-allocation-contacts.csv";
  const aliasToRoster = await loadAssignedMerchantAliasMap(companyId);

  await logReportDownload({
    companyId,
    userId,
    reportKey: "customer_insight:allocation_contacts",
    reportLabel: "Customer Insight Allocation Contacts",
    fileName,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(formatCsvHeaderLine(CONTACT_EXPORT_HEADERS))
        );

        let cursor: string | undefined;
        for (;;) {
          const batch = await prisma.contactMaster.findMany({
            where: {
              companyId,
              assignedMerchant: { not: "" },
            },
            take: ALLOCATION_EXPORT_BATCH_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: "asc" },
            select: {
              id: true,
              name: true,
              phoneNumber: true,
              assignedMerchant: true,
              phones: { select: { phoneNumber: true } },
            },
          });
          if (batch.length === 0) break;

          const lines: string[] = [];
          for (const contact of batch) {
            const raw = contact.assignedMerchant?.trim() ?? "";
            if (!raw) continue;
            const merchant = resolveAllocatedMerchant(raw, aliasToRoster);
            const phones = uniqueContactPhones(
              contact.phoneNumber,
              contact.phones
            );
            const row: AllocationContactExportRow = {
              merchant: merchant.label,
              merchant_value: merchant.value,
              name: contact.name,
              phone_number: phones[0] ?? "",
              extra_phones: phones.slice(1).join("; "),
            };
            lines.push(formatCsvDataLine(CONTACT_EXPORT_HEADERS, row));
          }
          if (lines.length > 0) {
            controller.enqueue(encoder.encode(lines.join("")));
          }

          cursor = batch[batch.length - 1]!.id;
          if (batch.length < ALLOCATION_EXPORT_BATCH_SIZE) break;
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
    return exportAllocatedContactsCsv(companyId, user.id);
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
      "merchant_value",
      "platinum",
      "gold",
      "other",
      "total",
      "purchase_platinum",
      "purchase_gold",
      "purchase_other",
      "purchase_total",
    ];
    rows = purchaseCountSummary.rows.map((r) => ({
      merchant: r.merchantLabel,
      merchant_value: r.merchantValue,
      platinum: r.allocation.platinum,
      gold: r.allocation.gold,
      other: r.allocation.other,
      total: r.allocation.total,
      purchase_platinum: r.purchaseCount.platinum,
      purchase_gold: r.purchaseCount.gold,
      purchase_other: r.purchaseCount.other,
      purchase_total: r.purchaseCount.total,
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
      "merchant_value",
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
        merchant: r.merchantLabel,
        merchant_value: r.merchantValue,
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
        merchant_value: "",
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

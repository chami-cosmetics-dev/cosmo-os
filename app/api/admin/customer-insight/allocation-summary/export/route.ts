import { NextRequest, NextResponse } from "next/server";

import {
  ALLOCATION_EXPORT_BATCH_SIZE,
  loadAssignedMerchantAliasMap,
  resolveAllocatedMerchant,
  uniqueContactPhones,
} from "@/lib/customer-insight/allocation-summary";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { prisma } from "@/lib/prisma";
import { logReportDownload } from "@/lib/report-download-log";
import { requirePermission } from "@/lib/rbac";
import {
  formatCsvDataLine,
  formatCsvHeaderLine,
  type CsvPrimitive,
} from "@/lib/reports/csv";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EXPORT_HEADERS = [
  "merchant",
  "merchant_value",
  "name",
  "phone_number",
  "extra_phones",
] as const;

type AllocationExportRow = Record<(typeof EXPORT_HEADERS)[number], CsvPrimitive>;

export async function GET(_request: NextRequest) {
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

  const fileName = "insight-merchant-allocation-summary.csv";
  const aliasToRoster = await loadAssignedMerchantAliasMap(companyId);

  await logReportDownload({
    companyId,
    userId: user.id,
    reportKey: "customer_insight:allocation_summary",
    reportLabel: "Customer Insight Allocation Summary",
    fileName,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(formatCsvHeaderLine(EXPORT_HEADERS)));

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
            const row: AllocationExportRow = {
              merchant: merchant.label,
              merchant_value: merchant.value,
              name: contact.name,
              phone_number: phones[0] ?? "",
              extra_phones: phones.slice(1).join("; "),
            };
            lines.push(formatCsvDataLine(EXPORT_HEADERS, row));
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

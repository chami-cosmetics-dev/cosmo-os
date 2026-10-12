import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { loadAssignedMerchantAliasMap } from "@/lib/customer-insight/allocation-summary";
import { firstPurchaseAtByContactIds } from "@/lib/customer-insight/first-purchase";
import { prisma } from "@/lib/prisma";
import { logReportDownload } from "@/lib/report-download-log";
import {
  CONTACT_DUMP_PARTS,
  CONTACT_DUMP_HEADERS,
  CONTACT_DUMP_SELECT,
  type ContactDumpPartKey,
  buildContactDumpCsv,
  buildContactDumpRow,
  contactDumpListWhere,
} from "@/lib/reports/contact-dump";
import { formatCsvDataLine, formatCsvHeaderLine } from "@/lib/reports/csv";
import { DUMP_TOTAL_HEADER } from "@/lib/reports/dump-download";
import { getContactDumpPermission } from "@/lib/report-permissions";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONTACT_DUMP_BATCH_SIZE = 1000;

type ContactDumpContact = Prisma.ContactMasterGetPayload<{ select: typeof CONTACT_DUMP_SELECT }>;

function getRequestedPart(value: string | null): ContactDumpPartKey {
  if (!value) return "1";
  return value in CONTACT_DUMP_PARTS ? (value as ContactDumpPartKey) : "1";
}

export async function GET(request: NextRequest) {
  const part = getRequestedPart(request.nextUrl.searchParams.get("part"));
  const auth = await requirePermission(getContactDumpPermission(part));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const config = CONTACT_DUMP_PARTS[part];
  const where = contactDumpListWhere(companyId);
  const today = formatAppIsoDate(new Date());
  const suffix = part === "all" ? "all" : part.replace("_", "-");
  const fileName = `contact-dump-${suffix}-${today}.csv`;

  if (part === "all") {
    const total = await prisma.contactMaster.count({ where });

    await logReportDownload({
      companyId,
      userId: auth.context?.user?.id,
      reportKey: `contact-dump:${part}`,
      reportLabel: "Contact Number List with details (All)",
      filters: `part=${part}`,
      fileName,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let cursor:
          | {
              updatedAt: Date;
              createdAt: Date;
              id: string;
            }
          | null = null;

        controller.enqueue(encoder.encode(formatCsvHeaderLine(CONTACT_DUMP_HEADERS)));

        try {
          while (true) {
            if (request.signal.aborted) break;

            const batch: ContactDumpContact[] = await prisma.contactMaster.findMany({
              where: cursor
                ? {
                    AND: [
                      where,
                      {
                        OR: [
                          { updatedAt: { lt: cursor.updatedAt } },
                          {
                            updatedAt: cursor.updatedAt,
                            createdAt: { lt: cursor.createdAt },
                          },
                          {
                            updatedAt: cursor.updatedAt,
                            createdAt: cursor.createdAt,
                            id: { lt: cursor.id },
                          },
                        ],
                      },
                    ],
                  }
                : where,
              orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
              take: CONTACT_DUMP_BATCH_SIZE,
              select: CONTACT_DUMP_SELECT,
            });

            if (batch.length === 0) break;

            controller.enqueue(
              encoder.encode(
                batch
                  .map((contact) => formatCsvDataLine(CONTACT_DUMP_HEADERS, buildContactDumpRow(contact)))
                  .join(""),
              ),
            );

            const last = batch[batch.length - 1];
            cursor = {
              updatedAt: last.updatedAt,
              createdAt: last.createdAt,
              id: last.id,
            };
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
        [DUMP_TOTAL_HEADER]: String(total),
      },
    });
  }

  const contacts = await prisma.contactMaster.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    skip: config.start,
    take: config.size,
    select: CONTACT_DUMP_SELECT,
  });

  const [firstPurchaseById, aliasToRoster] = await Promise.all([
    firstPurchaseAtByContactIds(
      companyId,
      contacts.map((contact) => contact.id)
    ),
    loadAssignedMerchantAliasMap(companyId),
  ]);
  const csv = buildContactDumpCsv(
    contacts.map((contact) => ({
      ...contact,
      firstPurchaseAt: firstPurchaseById.get(contact.id) ?? null,
    })),
    aliasToRoster
  );
  const today = formatAppIsoDate(new Date());
  const suffix = part === "all" ? "all" : part.replace("_", "-");
  const fileName = `contact-dump-${suffix}-${today}.csv`;

  await logReportDownload({
    companyId,
    userId: auth.context?.user?.id,
    reportKey: `contact-dump:${part}`,
    reportLabel: `Contact Number List with details Part ${part}`,
    filters: `part=${part}`,
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

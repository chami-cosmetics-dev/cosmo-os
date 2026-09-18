import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

/* eslint-disable @typescript-eslint/no-require-imports */
const pdfMake = require("pdfmake") as {
  virtualfs: { writeFileSync(filename: string, content: Buffer): void };
  addFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(fn: (url: string) => boolean): void;
  setLocalAccessPolicy(fn: (path: string) => boolean): void;
  createPdf(docDef: unknown): { getBuffer(): Promise<Buffer> };
};
const vfsFonts = require("pdfmake/build/vfs_fonts") as Record<string, string>;
/* eslint-enable @typescript-eslint/no-require-imports */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

for (const [key, val] of Object.entries(vfsFonts)) {
  pdfMake.virtualfs.writeFileSync(key, Buffer.from(val, "base64"));
}
pdfMake.addFonts({
  Roboto: {
    normal: "Roboto-Regular.ttf",
    bold: "Roboto-Medium.ttf",
    italics: "Roboto-Italic.ttf",
    bolditalics: "Roboto-MediumItalic.ttf",
  },
});
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(() => false);

function parseDateParam(value: string | null, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function grnWorkflowStatus(row: {
  handoverAt: Date | null;
  valuedAt: Date | null;
  receivedAt: Date | null;
}) {
  if (row.receivedAt) return "GRN Received";
  if (row.valuedAt) return "Valued";
  if (row.handoverAt) return "Handover";
  return "Pending";
}

function filenameDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function exportRows(
  rows: Awaited<ReturnType<typeof loadRows>>,
) {
  return rows.map((row) => ({
    "PR No": row.name,
    "Adjustment No": row.supplierStockReturnName ?? "",
    "GRN Date": formatDate(row.creation ?? row.postingDate),
    "GRN By": row.owner ?? "",
    Supplier: row.supplier,
    "Supplier Name": row.supplierName ?? "",
    "Handover Date": formatDate(row.handoverAt),
    Valued: formatDate(row.valuedAt),
    "GRN Received": formatDate(row.receivedAt),
    Status: row.docstatus === 2 ? "Cancelled" : grnWorkflowStatus(row),
  }));
}

async function loadRows(companyId: string, from: Date | null, to: Date | null) {
  const dateFilter = from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined;
  return prisma.grnPurchaseReceipt.findMany({
    where: {
      companyId,
      ...(dateFilter
        ? {
            OR: [
              { creation: dateFilter },
              { creation: null, postingDate: dateFilter },
            ],
          }
        : {}),
    },
    orderBy: [{ creation: "desc" }, { createdAt: "desc" }],
    take: 5000,
  });
}

function buildXlsx(rows: ReturnType<typeof exportRows>) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "GRN");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function buildPdf(rows: ReturnType<typeof exportRows>, title: string) {
  const headers = [
    "PR No",
    "Adjustment No",
    "GRN Date",
    "GRN By",
    "Supplier",
    "Handover Date",
    "Valued",
    "GRN Received",
  ];
  const body = [
    headers.map((header) => ({ text: header, bold: true, fontSize: 7 })),
    ...rows.map((row) =>
      headers.map((header) => ({
        text: String(row[header as keyof typeof row] || "-"),
        fontSize: 6,
      })),
    ),
  ];

  return pdfMake.createPdf({
    pageOrientation: "landscape",
    pageMargins: [18, 28, 18, 24],
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: "right",
      fontSize: 8,
      margin: [18, 0, 18, 12],
    }),
    content: [
      { text: title, fontSize: 15, bold: true, margin: [0, 0, 0, 10] },
      rows.length === 0
        ? { text: "No purchase receipts found.", fontSize: 9, italics: true }
        : {
            table: {
              headerRows: 1,
              widths: ["auto", "auto", "auto", "auto", "*", "auto", "auto", "auto"],
              body,
            },
            layout: "lightHorizontalLines",
          },
    ],
  }).getBuffer();
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("purchasing.grn.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const from = parseDateParam(request.nextUrl.searchParams.get("from"));
  const to = parseDateParam(request.nextUrl.searchParams.get("to"), true);
  const format = request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const rows = exportRows(await loadRows(companyId, from, to));
  const stamp = `${request.nextUrl.searchParams.get("from") ?? filenameDate(new Date())}-to-${
    request.nextUrl.searchParams.get("to") ?? filenameDate(new Date())
  }`;
  const base = `grn-table-${stamp}`;

  if (format === "pdf") {
    const buffer = await buildPdf(rows, `GRN table ${stamp}`);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const buffer = buildXlsx(rows);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}


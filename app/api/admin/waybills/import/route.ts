import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";

import { writeAuditLog } from "@/lib/audit-log";
import {
  findOrderIdByInvoiceRef,
  normalizeInvoiceLookup,
  saveOrderWaybill,
} from "@/lib/order-waybills";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

type ParsedRow = Record<string, string>;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseCsv(content: string): ParsedRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(value.trim());
      value = "";
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.trim());
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  if (rows.length === 0) return [];

  const headers = rows[0]!.map((header) => normalizeHeader(header));
  return rows.slice(1).map((cells) => {
    const mapped: ParsedRow = {};
    headers.forEach((header, index) => {
      mapped[header] = cells[index]?.trim() ?? "";
    });
    return mapped;
  });
}

function parseXlsx(buffer: ArrayBuffer): ParsedRow[] {
  const workbook = XLSX.read(Buffer.from(buffer), { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  return rows.map((row) => {
    const mapped: ParsedRow = {};
    for (const [key, value] of Object.entries(row)) {
      mapped[normalizeHeader(key)] = String(value ?? "").trim();
    }
    return mapped;
  });
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function pickValue(row: ParsedRow, keys: string[]) {
  for (const key of keys) {
    const value = row[normalizeHeader(key)];
    if (value?.trim()) return value.trim();
  }
  return "";
}

async function requireWaybillImportAuth() {
  const auth = await requireAnyPermission(["fulfillment.waybill_lookup.import"]);
  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No company associated with your account" }, { status: 404 }),
    };
  }

  return { ok: true as const, companyId, userId: auth.context!.user!.id };
}

export async function POST(request: NextRequest) {
  const auth = await requireWaybillImportAuth();
  if (!auth.ok) return auth.response;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV or XLSX file is required." }, { status: 400 });
  }

  const lowerFileName = file.name.toLowerCase();
  const isCsv = lowerFileName.endsWith(".csv");
  const isXlsx = lowerFileName.endsWith(".xlsx") || lowerFileName.endsWith(".xls");
  if (!isCsv && !isXlsx) {
    return NextResponse.json({ error: "Only CSV, XLSX, or XLS files are supported for this upload." }, { status: 400 });
  }

  const rows = isCsv ? parseCsv(await file.text()) : parseXlsx(await file.arrayBuffer());
  if (rows.length === 0) {
    return NextResponse.json({ error: "Uploaded file appears empty." }, { status: 400 });
  }
  if (rows.length > 10000) {
    return NextResponse.json({ error: "File row limit is 10,000 per import." }, { status: 400 });
  }

  // Cumulative multi-file import: each upload creates a WaybillUpload history row and
  // upserts waybills by (companyId, waybillNo). Prior company waybills are never deleted.
  const uploadId = randomUUID();
  const fileType = isCsv ? "csv" : lowerFileName.endsWith(".xls") ? "xls" : "xlsx";

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "WaybillUpload" (
        "id",
        "companyId",
        "uploadedById",
        "fileName",
        "fileType",
        "totalRows",
        "status",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${uploadId},
        ${auth.companyId},
        ${auth.userId},
        ${file.name},
        ${fileType},
        ${rows.length},
        ${"processing"},
        ${new Date()},
        ${new Date()}
      )
    `
  );

  let imported = 0;
  let invalidRows = 0;
  let unmatchedRows = 0;

  for (const row of rows) {
    const invoiceNumber = pickValue(row, [
      "Your Reference",
      "Invoice Number",
      "Invoice No",
      "Invoice No.",
      "Invoice",
      "Order Number",
      "Order No",
      "Order ID",
      "Reference",
    ]);
    const waybillNo = pickValue(row, [
      "Citypak Tracking",
      "Waybill No",
      "Waybill No.",
      "Waybill Number",
      "Waybill",
      "Tracking Number",
      "Tracking No",
      "Tracking No.",
      "Tracking",
      "AWB",
      "AWB No",
    ]);
    const courierName = pickValue(row, ["Courier", "Courier Name", "Service"]) || "Citypak";

    if (!normalizeInvoiceLookup(invoiceNumber) || !waybillNo) {
      invalidRows += 1;
      continue;
    }

    const orderId = await findOrderIdByInvoiceRef(auth.companyId, invoiceNumber);
    if (!orderId) unmatchedRows += 1;

    await saveOrderWaybill({
      companyId: auth.companyId,
      orderId,
      invoiceNumber,
      waybillNo,
      courierName,
      source: isCsv ? "csv_upload" : "xlsx_upload",
      uploadId,
      rawPayload: row,
    });
    imported += 1;
  }

  const summary = {
    totalRows: rows.length,
    imported,
    invalidRows,
    unmatchedRows,
  };

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "WaybillUpload"
      SET
        "importedRows" = ${summary.imported},
        "invalidRows" = ${summary.invalidRows},
        "unmatchedRows" = ${summary.unmatchedRows},
        "summary" = ${JSON.stringify(summary)}::jsonb,
        "status" = ${"completed"},
        "updatedAt" = ${new Date()}
      WHERE "id" = ${uploadId}
        AND "companyId" = ${auth.companyId}
    `
  );

  await writeAuditLog({
    companyId: auth.companyId,
    actorUserId: auth.userId,
    module: "orders",
    action: "fulfillment_updated",
    entityType: "OrderWaybillImport",
    entityId: uploadId,
    summary: `Imported waybills from ${file.name}`,
    metadata: {
      fileName: file.name,
      summary,
    },
  });

  const latest = await prisma.orderWaybill.findMany({
    where: { companyId: auth.companyId },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: {
      id: true,
      invoiceNumber: true,
      waybillNo: true,
      courierName: true,
      source: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ message: "Waybill import completed.", summary, latest });
}

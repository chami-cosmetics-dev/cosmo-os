import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { parseRiderDeliveryZoneMembersFromWorkbookSheets } from "@/lib/rider-delivery-charge";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const LABEL_MAX = 200;

export async function GET() {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [count, sample] = await Promise.all([
    prisma.riderDeliveryZoneMember.count(),
    prisma.riderDeliveryZoneMember.findMany({
      orderBy: [{ zoneLabel: "asc" }, { districtLabel: "asc" }],
      take: 20,
      select: {
        zoneLabel: true,
        districtLabel: true,
      },
    }),
  ]);

  return NextResponse.json({
    count,
    sample: sample.map((row) => ({
      zoneLabel: row.zoneLabel,
      districtLabel: row.districtLabel,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload an Excel file as form field \"file\"" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File must be between 1 byte and 8MB" }, { status: 400 });
  }
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    return NextResponse.json({ error: "Only .xlsx / .xls files are supported" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return NextResponse.json({ error: "Could not read Excel file" }, { status: 400 });
  }

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];
    return { name, rows };
  });

  const parsed = parseRiderDeliveryZoneMembersFromWorkbookSheets(sheets);
  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: parsed.errors[0] ?? "No valid zone membership rows found", details: parsed.errors },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.riderDeliveryZoneMember.deleteMany({});
    await tx.riderDeliveryZoneMember.createMany({
      data: parsed.rows.map((row) => ({
        zoneKey: row.zoneKey,
        zoneLabel: row.zoneLabel.slice(0, LABEL_MAX),
        districtLabelKey: row.districtLabelKey,
        districtLabel: row.districtLabel.slice(0, LABEL_MAX),
      })),
    });
  });

  return NextResponse.json({
    imported: parsed.rows.length,
    sheetName: parsed.sheetName,
    format: parsed.format,
    skippedBlank: parsed.skippedBlank,
    warnings: parsed.errors.slice(0, 50),
  });
}

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { parseRiderDeliveryChargeSheetRows } from "@/lib/rider-delivery-charge";
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
    prisma.riderDeliveryChargeRule.count(),
    prisma.riderDeliveryChargeRule.findMany({
      orderBy: { label: "asc" },
      take: 20,
      select: {
        label: true,
        district: true,
        shippingAmount: true,
        riderDeliveryCharge: true,
      },
    }),
  ]);

  return NextResponse.json({
    count,
    sample: sample.map((row) => ({
      label: row.label,
      district: row.district,
      shippingAmount: row.shippingAmount.toFixed(2),
      riderDeliveryCharge: row.riderDeliveryCharge.toFixed(2),
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

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return NextResponse.json({ error: "Excel file has no sheets" }, { status: 400 });
  }
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];

  const parsed = parseRiderDeliveryChargeSheetRows(rawRows);
  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: parsed.errors[0] ?? "No valid rows found", details: parsed.errors },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.riderDeliveryChargeRule.deleteMany();
    const chunkSize = 500;
    for (let i = 0; i < parsed.rows.length; i += chunkSize) {
      const chunk = parsed.rows.slice(i, i + chunkSize);
      await tx.riderDeliveryChargeRule.createMany({
        data: chunk.map((row) => ({
          labelKey: row.labelKey,
          label: row.label.slice(0, LABEL_MAX),
          district: row.district,
          shippingAmount: row.shippingAmount,
          riderDeliveryCharge: row.riderDeliveryCharge,
          shippingAccount: row.shippingAccount,
          costCenter: row.costCenter,
        })),
      });
    }
  });

  return NextResponse.json({
    imported: parsed.rows.length,
    warnings: parsed.errors.slice(0, 50),
  });
}

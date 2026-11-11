import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { z } from "zod";

import { parseRiderDeliveryChargesFromWorkbookSheets } from "@/lib/rider-delivery-charge";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const LABEL_MAX = 200;
const PAGE_SIZE = 20;

const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
});

const patchBodySchema = z.object({
  id: cuidSchema,
  riderDeliveryCharge: z.coerce.number().finite().min(0).max(1_000_000),
});

export async function GET(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsedQuery = listQuerySchema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? "",
    page: request.nextUrl.searchParams.get("page") ?? "1",
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { q, page } = parsedQuery.data;
  const where = q
    ? { label: { contains: q, mode: "insensitive" as const } }
    : {};

  const [count, rows] = await Promise.all([
    prisma.riderDeliveryChargeRule.count({ where }),
    prisma.riderDeliveryChargeRule.findMany({
      where,
      orderBy: { label: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        label: true,
        district: true,
        shippingAmount: true,
        riderDeliveryCharge: true,
      },
    }),
  ]);

  return NextResponse.json({
    count,
    page,
    pageSize: PAGE_SIZE,
    rows: rows.map((row) => ({
      id: row.id,
      label: row.label,
      district: row.district,
      shippingAmount: row.shippingAmount.toFixed(2),
      riderDeliveryCharge: row.riderDeliveryCharge.toFixed(2),
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid rider pay update" }, { status: 400 });
  }

  const { id, riderDeliveryCharge } = parsed.data;
  try {
    const updated = await prisma.riderDeliveryChargeRule.update({
      where: { id },
      data: { riderDeliveryCharge },
      select: {
        id: true,
        label: true,
        district: true,
        shippingAmount: true,
        riderDeliveryCharge: true,
      },
    });
    return NextResponse.json({
      row: {
        id: updated.id,
        label: updated.label,
        district: updated.district,
        shippingAmount: updated.shippingAmount.toFixed(2),
        riderDeliveryCharge: updated.riderDeliveryCharge.toFixed(2),
      },
    });
  } catch {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }
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

  const parsed = parseRiderDeliveryChargesFromWorkbookSheets(sheets);
  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: parsed.errors[0] ?? "No valid rows found", details: parsed.errors },
      { status: 400 }
    );
  }

  let created = 0;
  let updated = 0;
  let removedZoneChargeKeys = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of parsed.rows) {
      const data = {
        label: row.label.slice(0, LABEL_MAX),
        district: row.district,
        shippingAmount: row.shippingAmount,
        riderDeliveryCharge: row.riderDeliveryCharge,
        shippingAccount: row.shippingAccount,
        costCenter: row.costCenter,
      };
      const existing = await tx.riderDeliveryChargeRule.findUnique({
        where: { labelKey: row.labelKey },
        select: { id: true },
      });
      if (existing) {
        await tx.riderDeliveryChargeRule.update({
          where: { labelKey: row.labelKey },
          data,
        });
        updated += 1;
      } else {
        await tx.riderDeliveryChargeRule.create({
          data: {
            labelKey: row.labelKey,
            ...data,
          },
        });
        created += 1;
      }
    }

    // Zone Name is district grouping only — never keep Zone A/B pay keys from older imports.
    const removed = await tx.riderDeliveryChargeRule.deleteMany({
      where: { labelKey: { startsWith: "zone " } },
    });
    removedZoneChargeKeys = removed.count;
  });

  return NextResponse.json({
    imported: parsed.rows.length,
    created,
    updated,
    skippedBlank: parsed.skippedBlank,
    sheetName: parsed.sheetName,
    format: parsed.format,
    removedZoneChargeKeys,
    warnings: parsed.errors.slice(0, 50),
  });
}

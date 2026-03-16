import { NextRequest, NextResponse } from "next/server";

import { getLatestOrderPurchaseAt } from "@/lib/orders-last-purchase";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

type ParsedRow = Record<string, string>;

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

  const headers = rows[0]!.map((h) => h.toLowerCase().trim());
  const dataRows = rows.slice(1);
  return dataRows.map((cells) => {
    const mapped: ParsedRow = {};
    headers.forEach((header, idx) => {
      mapped[header] = cells[idx] ?? "";
    });
    return mapped;
  });
}

function pickValue(row: ParsedRow, keys: string[]) {
  for (const key of keys) {
    if (row[key]?.trim()) return row[key]!.trim();
  }
  return "";
}

function normalizeNullable(value: string) {
  const v = value.trim();
  return v.length > 0 ? v : null;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("orders.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.context!.user!.id },
    select: { companyId: true },
  });
  const companyId = user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
  }

  const filename = file.name.toLowerCase();
  if (!filename.endsWith(".csv")) {
    return NextResponse.json({ error: "Only CSV files are supported for import" }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return NextResponse.json({ error: "CSV appears empty" }, { status: 400 });
  }
  if (rows.length > 10000) {
    return NextResponse.json({ error: "CSV row limit is 10,000 per import" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = pickValue(row, ["name", "full_name", "customer_name"]).trim();
    const email = normalizeNullable(pickValue(row, ["email", "email_address"]).toLowerCase());
    const phoneNumber = normalizeNullable(pickValue(row, ["phone", "phone_number", "mobile"]));
    const recentMerchant = normalizeNullable(
      pickValue(row, ["recent_merchant", "recent_merchant_name", "merchant", "agent"])
    );
    const lastPurchaseAt = await getLatestOrderPurchaseAt(companyId, email, phoneNumber);

    if (!name || (!email && !phoneNumber)) {
      skipped += 1;
      continue;
    }

    const existing = await prisma.contactMaster.findFirst({
      where: {
        companyId,
        OR: [
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
          ...(phoneNumber ? [{ phoneNumber }] : []),
        ],
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.contactMaster.update({
        where: { id: existing.id },
        data: {
          name,
          email,
          phoneNumber,
          recentMerchant,
          lastPurchaseAt,
        },
      });
      updated += 1;
      continue;
    }

    await prisma.contactMaster.create({
      data: {
        companyId,
        name,
        email,
        phoneNumber,
        recentMerchant,
        lastPurchaseAt,
      },
    });
    created += 1;
  }

  return NextResponse.json({
    message: "Import completed",
    summary: { totalRows: rows.length, created, updated, skipped },
  });
}

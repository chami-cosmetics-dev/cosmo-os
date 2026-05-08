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

function toPairKey(email: string | null, phoneNumber: string | null) {
  return `${email ?? ""}|${phoneNumber ?? ""}`;
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

  const normalizedRows = rows
    .map((row) => ({
      name: pickValue(row, ["name", "full_name", "customer_name"]).trim(),
      email: normalizeNullable(pickValue(row, ["email", "email_address"]).toLowerCase()),
      phoneNumber: normalizeNullable(pickValue(row, ["phone", "phone_number", "mobile"])),
      recentMerchant: normalizeNullable(
        pickValue(row, ["recent_merchant", "recent_merchant_name", "merchant", "agent"])
      ),
    }))
    .filter((row) => {
      if (!row.name || (!row.email && !row.phoneNumber)) {
        skipped += 1;
        return false;
      }
      return true;
    });

  const uniqueEmails = Array.from(
    new Set(normalizedRows.map((row) => row.email).filter((v): v is string => Boolean(v)))
  );
  const uniquePhones = Array.from(
    new Set(normalizedRows.map((row) => row.phoneNumber).filter((v): v is string => Boolean(v)))
  );

  const existingCandidates =
    uniqueEmails.length > 0 || uniquePhones.length > 0
      ? await prisma.contactMaster.findMany({
          where: {
            companyId,
            OR: [
              ...(uniqueEmails.length > 0 ? [{ email: { in: uniqueEmails } }] : []),
              ...(uniquePhones.length > 0 ? [{ phoneNumber: { in: uniquePhones } }] : []),
            ],
          },
          select: { id: true, email: true, phoneNumber: true },
        })
      : [];

  const contactIdByEmail = new Map<string, string>();
  const contactIdByPhone = new Map<string, string>();
  for (const row of existingCandidates) {
    if (row.email) contactIdByEmail.set(row.email.toLowerCase(), row.id);
    if (row.phoneNumber) contactIdByPhone.set(row.phoneNumber, row.id);
  }

  const purchaseCache = new Map<string, Date | null>();

  for (const row of normalizedRows) {
    const key = toPairKey(row.email, row.phoneNumber);
    const cachedPurchase = purchaseCache.get(key);
    const lastPurchaseAt =
      cachedPurchase !== undefined
        ? cachedPurchase
        : await getLatestOrderPurchaseAt(companyId, row.email, row.phoneNumber);
    purchaseCache.set(key, lastPurchaseAt);

    let existingId =
      (row.email ? contactIdByEmail.get(row.email.toLowerCase()) : undefined) ??
      (row.phoneNumber ? contactIdByPhone.get(row.phoneNumber) : undefined);

    if (!existingId) {
      const fallback = await prisma.contactMaster.findFirst({
        where: {
          companyId,
          OR: [
            ...(row.email ? [{ email: { equals: row.email, mode: "insensitive" as const } }] : []),
            ...(row.phoneNumber ? [{ phoneNumber: row.phoneNumber }] : []),
          ],
        },
        select: { id: true, email: true, phoneNumber: true },
      });
      if (fallback) {
        existingId = fallback.id;
        if (fallback.email) contactIdByEmail.set(fallback.email.toLowerCase(), fallback.id);
        if (fallback.phoneNumber) contactIdByPhone.set(fallback.phoneNumber, fallback.id);
      }
    }

    if (existingId) {
      await prisma.contactMaster.update({
        where: { id: existingId },
        data: {
          name: row.name,
          email: row.email,
          phoneNumber: row.phoneNumber,
          recentMerchant: row.recentMerchant,
          lastPurchaseAt,
        },
      });
      if (row.email) contactIdByEmail.set(row.email.toLowerCase(), existingId);
      if (row.phoneNumber) contactIdByPhone.set(row.phoneNumber, existingId);
      updated += 1;
      continue;
    }

    const createdContact = await prisma.contactMaster.create({
      data: {
        companyId,
        name: row.name,
        email: row.email,
        phoneNumber: row.phoneNumber,
        recentMerchant: row.recentMerchant,
        lastPurchaseAt,
      },
      select: { id: true },
    });
    if (row.email) contactIdByEmail.set(row.email.toLowerCase(), createdContact.id);
    if (row.phoneNumber) contactIdByPhone.set(row.phoneNumber, createdContact.id);
    created += 1;
  }

  return NextResponse.json({
    message: "Import completed",
    summary: { totalRows: rows.length, created, updated, skipped },
  });
}

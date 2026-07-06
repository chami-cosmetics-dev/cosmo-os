import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS } from "@/lib/validation";

type ParsedRow = Record<string, string>;
type OptionType = "serviceProvider" | "district" | "town" | "origin" | "customerType" | "category";

const HEADER_TO_TYPE: Record<string, OptionType> = {
  "s provider": "serviceProvider",
  "service provider": "serviceProvider",
  serviceprovider: "serviceProvider",
  district: "district",
  town: "town",
  origin: "origin",
  category: "category",
  "cus type": "customerType",
  "customer type": "customerType",
  customertype: "customerType",
};

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
      if (char === "\r" && next === "\n") i += 1;
      row.push(value.trim());
      value = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0]!.map(normalizeHeader);

  return rows.slice(1).map((cells) => {
    const mapped: ParsedRow = {};
    headers.forEach((header, index) => {
      mapped[header] = cells[index] ?? "";
    });
    return mapped;
  });
}

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("contacts.allocation.settings");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
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
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "Only CSV files are supported" }, { status: 400 });
  }

  const rows = parseCsv(await file.text());
  if (rows.length === 0) {
    return NextResponse.json({ error: "CSV appears empty" }, { status: 400 });
  }
  if (rows.length > 10000) {
    return NextResponse.json({ error: "CSV row limit is 10,000 per import" }, { status: 400 });
  }

  const seen = new Set<string>();
  let skipped = 0;
  const items: Array<{ companyId: string; type: OptionType; value: string }> = [];

  for (const row of rows) {
    for (const [header, rawValue] of Object.entries(row)) {
      const type = HEADER_TO_TYPE[header];
      if (!type) continue;

      const value = rawValue.trim();
      if (!value || value.length > LIMITS.contactAllocationOptionValue.max) {
        if (value) skipped += 1;
        continue;
      }

      const key = `${type}:${value.toLowerCase()}`;
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }

      seen.add(key);
      items.push({ companyId, type, value });
    }
  }

  if (items.length === 0) {
    return NextResponse.json(
      { error: "No valid option values found. Use the provided CSV template headers." },
      { status: 400 }
    );
  }

  const result = await prisma.contactAllocationOption.createMany({
    data: items,
    skipDuplicates: true,
  });

  return NextResponse.json({
    message: "Import completed",
    summary: {
      parsed: items.length,
      created: result.count,
      skipped: skipped + (items.length - result.count),
    },
  });
}

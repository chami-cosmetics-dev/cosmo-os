import { writeAuditLog } from "@/lib/audit-log";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

export type AllocationImportSkip = {
  row: number;
  phone: string;
  merchant: string;
  error: string;
};

type ParsedRow = Record<string, string>;

const PHONE_KEYS = ["phone number", "phone", "tp", "tp number", "contact", "mobile"];
const MERCHANT_KEYS = [
  "allocated merchant",
  "allocated to",
  "assigned merchant",
  "merchant",
  "allocate to",
];

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAllocationCsv(content: string): ParsedRow[] {
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
      if (header) mapped[header] = cells[index] ?? "";
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

export function rowPhoneAndMerchant(row: ParsedRow) {
  return {
    phone: pickValue(row, PHONE_KEYS),
    merchant: pickValue(row, MERCHANT_KEYS),
  };
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function loadPhoneToContactId(companyId: string, variants: string[]) {
  const phoneToContactId = new Map<string, string>();
  for (const part of chunk(variants, 500)) {
    const [masters, extras] = await Promise.all([
      prisma.contactMaster.findMany({
        where: { companyId, phoneNumber: { in: part } },
        select: { id: true, phoneNumber: true },
      }),
      prisma.contactPhone.findMany({
        where: {
          phoneNumber: { in: part },
          contact: { companyId },
        },
        select: { phoneNumber: true, contactId: true },
      }),
    ]);
    for (const extra of extras) {
      if (!phoneToContactId.has(extra.phoneNumber)) {
        phoneToContactId.set(extra.phoneNumber, extra.contactId);
      }
    }
    for (const master of masters) {
      if (master.phoneNumber) phoneToContactId.set(master.phoneNumber, master.id);
    }
  }
  return phoneToContactId;
}

export async function importContactAllocations(input: {
  companyId: string;
  actorUserId: string;
  csvText: string;
  fileName?: string;
}) {
  const parsed = parseAllocationCsv(input.csvText);
  if (parsed.length === 0) {
    throw new Error("CSV has no data rows");
  }
  if (parsed.length > 2000) {
    throw new Error("CSV has too many rows (max 2000)");
  }

  const merchants = await prisma.user.findMany({
    where: {
      companyId: input.companyId,
      OR: [{ employeeProfile: null }, { employeeProfile: { status: "active" } }],
    },
    select: { knownName: true, name: true, email: true },
    take: 300,
  });
  const merchantByLabel = new Map<string, string>();
  for (const user of merchants) {
    const label = user.knownName?.trim() || user.name?.trim() || user.email?.trim();
    if (!label) continue;
    for (const alias of [user.knownName, user.name, user.email, label]) {
      const key = alias?.trim().toLowerCase();
      if (key) merchantByLabel.set(key, label);
    }
  }

  const skipped: AllocationImportSkip[] = [];
  const pending: Array<{
    row: number;
    phone: string;
    merchant: string;
    allocatedTo: string;
    variants: string[];
  }> = [];
  const variantSet = new Set<string>();

  for (let i = 0; i < parsed.length; i += 1) {
    const rowNum = i + 2;
    const { phone, merchant } = rowPhoneAndMerchant(parsed[i]!);
    if (!phone || !merchant) {
      skipped.push({
        row: rowNum,
        phone,
        merchant,
        error: "Missing phone or allocated merchant",
      });
      continue;
    }

    const allocatedTo = merchantByLabel.get(merchant.toLowerCase());
    if (!allocatedTo) {
      skipped.push({
        row: rowNum,
        phone,
        merchant,
        error: "Unknown merchant (must match Contact Master assignee name)",
      });
      continue;
    }

    const variants = buildPhoneLookupVariants(phone);
    for (const variant of variants) variantSet.add(variant);
    pending.push({ row: rowNum, phone, merchant, allocatedTo, variants });
  }

  const phoneToContactId = await loadPhoneToContactId(input.companyId, [...variantSet]);
  const updates = new Map<string, string>();

  for (const row of pending) {
    let contactId: string | undefined;
    for (const variant of row.variants) {
      contactId = phoneToContactId.get(variant);
      if (contactId) break;
    }
    if (!contactId) {
      skipped.push({
        row: row.row,
        phone: row.phone,
        merchant: row.merchant,
        error: "No contact found for that phone",
      });
      continue;
    }
    updates.set(contactId, row.allocatedTo);
  }

  const byMerchant = new Map<string, string[]>();
  for (const [contactId, allocatedTo] of updates) {
    const list = byMerchant.get(allocatedTo) ?? [];
    list.push(contactId);
    byMerchant.set(allocatedTo, list);
  }

  for (const [allocatedTo, contactIds] of byMerchant) {
    await prisma.contactMaster.updateMany({
      where: { companyId: input.companyId, id: { in: contactIds } },
      data: { assignedMerchant: allocatedTo },
    });
    await prisma.contactAllocationUpdate.createMany({
      data: contactIds.map((contactId) => ({
        companyId: input.companyId,
        contactId,
        merchantId: input.actorUserId,
        merchantName: allocatedTo,
        category: "allocation",
      })),
    });
  }

  await writeAuditLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    module: "contacts",
    action: "contact_allocation_imported",
    entityType: "ContactMaster",
    entityId: input.fileName ?? null,
    summary: `Imported allocation file: updated ${updates.size}, skipped ${skipped.length}`,
    metadata: {
      fileName: input.fileName ?? null,
      updated: updates.size,
      skipped: skipped.length,
      skipSample: skipped.slice(0, 20),
    },
  });

  return {
    totalRows: parsed.length,
    updated: updates.size,
    skipped: skipped.length,
    skips: skipped.slice(0, 50),
  };
}

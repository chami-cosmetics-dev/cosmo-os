import { LIMITS } from "@/lib/validation";
import { normalizeBrandName } from "@/lib/new-item-requests/brand";

export type BrandPriorityRow = {
  brandName: string;
  brandNameNormalized: string;
  priority: string;
};

export type BrandPriorityParseResult =
  | { ok: true; rows: BrandPriorityRow[] }
  | { ok: false; error: string };

function headerKey(cell: unknown): string {
  return String(cell ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isBrandHeader(header: string) {
  return header === "brand" || header === "brand name" || header === "vendor";
}

function isPriorityHeader(header: string) {
  return header === "priority" || header === "priority status";
}

function cellText(cell: unknown): string {
  if (cell == null) return "";
  return String(cell).trim();
}

export function parseBrandPrioritySheet(rows: unknown[][]): BrandPriorityParseResult {
  let headerIndex = -1;
  let brandCol = -1;
  let priorityCol = -1;

  for (let i = 0; i < rows.length; i += 1) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const headers = row.map(headerKey);
    const nextBrand = headers.findIndex(isBrandHeader);
    const nextPriority = headers.findIndex(isPriorityHeader);
    if (nextBrand >= 0 && nextPriority >= 0) {
      headerIndex = i;
      brandCol = nextBrand;
      priorityCol = nextPriority;
      break;
    }
  }

  if (headerIndex < 0) {
    return { ok: false, error: "Could not find Brand and Priority columns" };
  }

  const byNormalized = new Map<string, BrandPriorityRow>();
  for (const raw of rows.slice(headerIndex + 1)) {
    const row = Array.isArray(raw) ? raw : [];
    const brandName = cellText(row[brandCol]);
    const priority = cellText(row[priorityCol]);
    if (!brandName || !priority) continue;
    if (priority.length > LIMITS.newItemRequestPriority.max) continue;
    const brandNameNormalized = normalizeBrandName(brandName);
    if (!brandNameNormalized) continue;
    byNormalized.set(brandNameNormalized, {
      brandName,
      brandNameNormalized,
      priority,
    });
  }

  const parsed = [...byNormalized.values()];
  if (parsed.length === 0) {
    return { ok: false, error: "No usable brand priority rows" };
  }
  return { ok: true, rows: parsed };
}

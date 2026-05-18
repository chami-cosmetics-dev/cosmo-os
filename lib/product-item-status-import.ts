import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

import { normalizeProductItemStatusLabel } from "@/lib/product-item-status";
import { prisma } from "@/lib/prisma";

export type ProductItemStatusImportRow = {
  sku: string;
  itemStatusLabel: string;
  itemStatusCategory: string;
};

export type ProductItemStatusImportPreview = {
  totalRows: number;
  parsedRows: number;
  matchedSkus: number;
  matchedItems: number;
  unmatchedSkus: string[];
  byCategory: Record<string, number>;
  rows: ProductItemStatusImportRow[];
};

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeSku(value: unknown) {
  return String(value ?? "").trim();
}

function readWorkbook(buffer: Buffer, filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    return XLSX.read(buffer.toString("utf8"), { type: "string" });
  }
  return XLSX.read(buffer, { type: "buffer", cellDates: false });
}

export function parseProductItemStatusImportFile(buffer: Buffer, filename: string) {
  const workbook = readWorkbook(buffer, filename);
  const sheetName = workbook.SheetNames.includes("ALL")
    ? "ALL"
    : workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) {
    throw new Error("Could not find a readable sheet in the uploaded file.");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headerIndex = rows.findIndex((row) =>
    row.some((value) => normalizeHeader(value) === "variant sku")
  );
  if (headerIndex < 0) {
    throw new Error('Could not find a header row containing "Variant SKU".');
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const skuIndex = headers.indexOf("variant sku");
  const statusIndex = headers.indexOf("item status");
  if (skuIndex < 0 || statusIndex < 0) {
    throw new Error('Required columns missing. Need "Variant SKU" and "Item Status".');
  }

  const bySku = new Map<string, ProductItemStatusImportRow>();
  for (const row of rows.slice(headerIndex + 1)) {
    const sku = normalizeSku(row[skuIndex]);
    const itemStatusLabel = String(row[statusIndex] ?? "").trim();
    if (!sku) continue;

    const itemStatusCategory = normalizeProductItemStatusLabel(itemStatusLabel);
    bySku.set(sku.toLowerCase(), {
      sku,
      itemStatusLabel,
      itemStatusCategory,
    });
  }

  return {
    totalRows: Math.max(rows.length - headerIndex - 1, 0),
    rows: Array.from(bySku.values()),
  };
}

export async function buildProductItemStatusImportPreview(
  companyId: string,
  rows: ProductItemStatusImportRow[]
): Promise<ProductItemStatusImportPreview> {
  const normalizedRows = rows
    .map((row) => ({
      sku: normalizeSku(row.sku),
      itemStatusLabel: String(row.itemStatusLabel ?? "").trim(),
      itemStatusCategory: normalizeProductItemStatusLabel(row.itemStatusLabel),
    }))
    .filter((row) => row.sku);

  const skus = normalizedRows.map((row) => row.sku.toLowerCase());
  const existingItems =
    skus.length > 0
      ? await prisma.productItem.findMany({
          where: {
            companyId,
            sku: { not: null },
          },
          select: { sku: true },
        })
      : [];

  const itemCountBySku = new Map<string, number>();
  for (const item of existingItems) {
    const key = item.sku?.trim().toLowerCase();
    if (!key) continue;
    itemCountBySku.set(key, (itemCountBySku.get(key) ?? 0) + 1);
  }

  const byCategory: Record<string, number> = {};
  let matchedSkus = 0;
  let matchedItems = 0;
  const unmatchedSkus: string[] = [];

  for (const row of normalizedRows) {
    byCategory[row.itemStatusCategory] = (byCategory[row.itemStatusCategory] ?? 0) + 1;
    const count = itemCountBySku.get(row.sku.toLowerCase()) ?? 0;
    if (count > 0) {
      matchedSkus += 1;
      matchedItems += count;
    } else {
      unmatchedSkus.push(row.sku);
    }
  }

  return {
    totalRows: rows.length,
    parsedRows: normalizedRows.length,
    matchedSkus,
    matchedItems,
    unmatchedSkus,
    byCategory,
    rows: normalizedRows,
  };
}

export async function applyProductItemStatusImport(companyId: string, rows: ProductItemStatusImportRow[]) {
  const preview = await buildProductItemStatusImportPreview(companyId, rows);
  const updateGroups = new Map<
    string,
    { itemStatusCategory: string; itemStatusLabel: string | null; skus: string[] }
  >();

  const unmatchedSet = new Set(preview.unmatchedSkus.map((sku) => sku.toLowerCase()));
  for (const row of preview.rows) {
    if (unmatchedSet.has(row.sku.toLowerCase())) continue;
    const itemStatusCategory = normalizeProductItemStatusLabel(row.itemStatusLabel);
    const itemStatusLabel = itemStatusCategory === "UNCATEGORIZED" ? null : row.itemStatusLabel;
    const key = `${itemStatusCategory}\u0000${itemStatusLabel ?? ""}`;
    const group = updateGroups.get(key) ?? {
      itemStatusCategory,
      itemStatusLabel,
      skus: [],
    };
    group.skus.push(row.sku);
    updateGroups.set(key, group);
  }

  let updatedItems = 0;
  const chunkSize = 250;
  for (const group of updateGroups.values()) {
    for (let i = 0; i < group.skus.length; i += chunkSize) {
      const skus = group.skus.slice(i, i + chunkSize).map((sku) => sku.toLowerCase());
      const result = await prisma.$executeRaw`
        UPDATE "ProductItem"
        SET
          "itemStatusCategory" = ${group.itemStatusCategory},
          "itemStatusLabel" = ${group.itemStatusLabel}
        WHERE "companyId" = ${companyId}
          AND "sku" IS NOT NULL
          AND lower("sku") IN (${Prisma.join(skus)})
      `;
      updatedItems += Number(result);
    }
  }

  return {
    ...preview,
    updatedItems,
  };
}

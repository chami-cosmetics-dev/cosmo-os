import crypto from "node:crypto";
import { parseCsvRecords } from "@/lib/adapt-import/csv";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import { findCompetitorByNameOrSlug, validateCompetitorProductUrl } from "./competitors";
import { parsePackSize } from "./pack-size";

export type ImportError = {
  line: number;
  field: string;
  message: string;
};

export type ValidatedImportRow = {
  line: number;
  sku: string;
  competitorSlug: string;
  competitorId: string;
  competitorTitle: string;
  productUrl: string;
  priceLkr: number;
  inStock: boolean;
  checkDate: string; // YYYY-MM-DD
  notes: string | null;
  packSize: string | null;
  action: "create" | "update";
  oldPrice?: number;
  existingLinkId?: string;
};

export type ImportPreviewResult = {
  commitToken: string;
  summary: {
    totalRows: number;
    validRows: number;
    createCount: number;
    updateCount: number;
    skipCount: number;
    errorCount: number;
  };
  errors: ImportError[];
  sampleChanges: Array<{
    line: number;
    sku: string;
    competitor: string;
    action: "create" | "update";
    oldPrice?: number;
    newPrice: number;
  }>;
};

const TOKEN_SECRET =
  process.env.AUTH0_CLIENT_SECRET || process.env.ERPNEXT_API_SECRET || "cosmo-market-prices-salt";

export function parseCsvDate(val: string | null | undefined): string | null {
  if (!val) return null;
  const clean = val.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const d = new Date(`${clean}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : clean;
  }

  // DD/MM/YYYY or D/M/YYYY
  const slashMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];
    const ymd = `${year}-${month}-${day}`;
    const d = new Date(`${ymd}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : ymd;
  }

  return null;
}

export function parseInStock(val: string | null | undefined): boolean {
  if (!val) return true;
  const clean = val.trim().toLowerCase();
  if (["no", "n", "false", "0", "out of stock", "out_of_stock"].includes(clean)) {
    return false;
  }
  return true;
}

/**
 * Parses raw CSV text into structured records with normalized column keys.
 */
export function parseRawImportCsv(csvText: string): {
  headers: string[];
  records: Array<{ line: number; row: Record<string, string> }>;
} {
  const lines = parseCsvRecords(csvText);
  if (lines.length === 0) {
    return { headers: [], records: [] };
  }

  const headerRow = lines[0].map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_"),
  );

  const records: Array<{ line: number; row: Record<string, string> }> = [];

  for (let i = 1; i < lines.length; i++) {
    const rawCells = lines[i];
    // Ignore completely empty rows or example lines
    if (rawCells.every((c) => !c.trim())) continue;
    if (rawCells[0]?.trim().startsWith("#")) continue;

    const row: Record<string, string> = {};
    headerRow.forEach((col, idx) => {
      row[col] = rawCells[idx]?.trim() ?? "";
    });

    records.push({ line: i + 1, row });
  }

  return { headers: headerRow, records };
}

/**
 * Validates raw rows against database catalog & existing competitor links, producing preview summary.
 */
export async function validateImportRows(
  companyId: string,
  userId: string,
  records: Array<{ line: number; row: Record<string, string> }>,
): Promise<{
  validRows: ValidatedImportRow[];
  errors: ImportError[];
  preview: ImportPreviewResult;
}> {
  const errors: ImportError[] = [];
  const validRows: ValidatedImportRow[] = [];

  if (records.length === 0) {
    return {
      validRows: [],
      errors: [{ line: 1, field: "file", message: "CSV file contains no data rows" }],
      preview: {
        commitToken: "",
        summary: {
          totalRows: 0,
          validRows: 0,
          createCount: 0,
          updateCount: 0,
          skipCount: 0,
          errorCount: 1,
        },
        errors: [{ line: 1, field: "file", message: "CSV file contains no data rows" }],
        sampleChanges: [],
      },
    };
  }

  // 1. Gather all unique SKUs in file to batch-query
  const skusInFile = [
    ...new Set(
      records
        .map((r) => r.row.sku || r.row.item_code || r.row.item)
        .filter(Boolean),
    ),
  ];

  const dbCatalogItems = await prisma.productItem.findMany({
    where: {
      companyId,
      sku: { in: skusInFile },
      status: { not: "archived" },
    },
    select: { sku: true, productTitle: true },
  });

  const validSkuMap = new Map<string, string>();
  for (const item of dbCatalogItems) {
    if (item.sku) validSkuMap.set(item.sku.toLowerCase(), item.sku);
  }

  // 2. Fetch all competitors
  const dbCompetitors = await prisma.marketCompetitor.findMany({
    where: { active: true },
  });

  // 3. Fetch existing links for these SKUs
  const existingLinks = await prisma.marketCompetitorLink.findMany({
    where: {
      companyId,
      sku: { in: Array.from(validSkuMap.values()) },
    },
  });

  // key: `${sku.toLowerCase()}__${competitorId}`
  const existingLinkMap = new Map<string, (typeof existingLinks)[number]>();
  for (const l of existingLinks) {
    existingLinkMap.set(`${l.sku.toLowerCase()}__${l.competitorId}`, l);
  }

  // 4. Validate each line
  let createCount = 0;
  let updateCount = 0;

  for (const { line, row } of records) {
    const rawSku = (row.sku || row.item_code || row.item || "").trim();
    if (!rawSku) {
      errors.push({ line, field: "sku", message: "Missing SKU" });
      continue;
    }

    const exactSku = validSkuMap.get(rawSku.toLowerCase());
    if (!exactSku) {
      errors.push({ line, field: "sku", message: `SKU '${rawSku}' not found in catalog` });
      continue;
    }

    const rawCompetitor = (row.competitor || row.competitor_slug || row.store || "").trim();
    if (!rawCompetitor) {
      errors.push({ line, field: "competitor", message: "Missing competitor" });
      continue;
    }

    const compDef = findCompetitorByNameOrSlug(rawCompetitor);
    if (!compDef) {
      errors.push({
        line,
        field: "competitor",
        message: `Unknown competitor '${rawCompetitor}'`,
      });
      continue;
    }

    const dbComp = dbCompetitors.find((c) => c.slug === compDef.slug);
    if (!dbComp) {
      errors.push({
        line,
        field: "competitor",
        message: `Competitor '${compDef.name}' is not currently active in database`,
      });
      continue;
    }

    const rawPrice = (row.price_lkr || row.price || "").replace(/,/g, "").trim();
    const priceNum = parseFloat(rawPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      errors.push({
        line,
        field: "price_lkr",
        message: `Invalid price '${rawPrice}': must be a positive number`,
      });
      continue;
    }

    const rawDate = row.check_date || row.date || row.verified_date || "";
    const parsedDate = parseCsvDate(rawDate) || (rawDate ? null : formatAppIsoDate(new Date()));
    if (!parsedDate) {
      errors.push({
        line,
        field: "check_date",
        message: `Invalid check date '${rawDate}': must be YYYY-MM-DD or DD/MM/YYYY`,
      });
      continue;
    }

    const inStock = parseInStock(row.in_stock || row.stock);
    const existing = existingLinkMap.get(`${exactSku.toLowerCase()}__${dbComp.id}`);

    const productUrl = (row.product_url || row.url || existing?.productUrl || "").trim();
    const competitorTitle = (
      row.competitor_title ||
      row.title ||
      existing?.competitorTitle ||
      ""
    ).trim();

    if (!productUrl) {
      errors.push({
        line,
        field: "product_url",
        message: "Missing product URL (required on new competitor link)",
      });
      continue;
    }

    const urlCheck = validateCompetitorProductUrl(productUrl, dbComp.websiteDomain);
    if (!urlCheck.valid) {
      errors.push({
        line,
        field: "product_url",
        message: urlCheck.warning || "Invalid URL",
      });
      continue;
    }

    if (!competitorTitle) {
      errors.push({
        line,
        field: "competitor_title",
        message: "Missing competitor title",
      });
      continue;
    }

    const packSize = (row.pack_size || "").trim() || parsePackSize(competitorTitle)?.normalized || null;
    const notes = (row.notes || "").trim() || null;

    if (existing) {
      updateCount++;
      validRows.push({
        line,
        sku: exactSku,
        competitorSlug: dbComp.slug,
        competitorId: dbComp.id,
        competitorTitle,
        productUrl,
        priceLkr: priceNum,
        inStock,
        checkDate: parsedDate,
        notes,
        packSize,
        action: "update",
        oldPrice: Number(existing.listedPriceLkr),
        existingLinkId: existing.id,
      });
    } else {
      createCount++;
      validRows.push({
        line,
        sku: exactSku,
        competitorSlug: dbComp.slug,
        competitorId: dbComp.id,
        competitorTitle,
        productUrl,
        priceLkr: priceNum,
        inStock,
        checkDate: parsedDate,
        notes,
        packSize,
        action: "create",
      });
    }
  }

  // 5. Generate signed commitToken
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins
  const tokenPayload = {
    companyId,
    userId,
    expiresAt,
    rows: validRows,
  };

  const payloadStr = JSON.stringify(tokenPayload);
  const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(payloadStr).digest("hex");
  const commitToken = `${Buffer.from(payloadStr).toString("base64url")}.${sig}`;

  const sampleChanges = validRows.slice(0, 10).map((r) => ({
    line: r.line,
    sku: r.sku,
    competitor: r.competitorSlug,
    action: r.action,
    oldPrice: r.oldPrice,
    newPrice: r.priceLkr,
  }));

  const preview: ImportPreviewResult = {
    commitToken,
    summary: {
      totalRows: records.length,
      validRows: validRows.length,
      createCount,
      updateCount,
      skipCount: 0,
      errorCount: errors.length,
    },
    errors,
    sampleChanges,
  };

  return { validRows, errors, preview };
}

/**
 * Verifies commit token integrity and applies validated rows to the database with audit history.
 */
export async function applyImportCommitToken(
  companyId: string,
  userId: string,
  commitToken: string,
): Promise<{ applied: number }> {
  const parts = commitToken.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid commit token format");
  }

  const [b64Payload, sig] = parts;
  const payloadStr = Buffer.from(b64Payload, "base64url").toString("utf-8");
  const expectedSig = crypto.createHmac("sha256", TOKEN_SECRET).update(payloadStr).digest("hex");

  if (sig !== expectedSig) {
    throw new Error("Tampered or invalid commit token");
  }

  const payload: {
    companyId: string;
    userId: string;
    expiresAt: number;
    rows: ValidatedImportRow[];
  } = JSON.parse(payloadStr);

  if (payload.companyId !== companyId) {
    throw new Error("Commit token was generated for a different company");
  }

  if (Date.now() > payload.expiresAt) {
    throw new Error("Commit token has expired (15 minute validity exceeded). Please re-upload.");
  }

  let applied = 0;

  for (const row of payload.rows) {
    const checkDateParsed = new Date(`${row.checkDate}T00:00:00Z`);

    if (row.existingLinkId) {
      // Update existing
      if (row.oldPrice != null && row.oldPrice !== row.priceLkr) {
        await prisma.marketCompetitorPriceHistory.create({
          data: {
            linkId: row.existingLinkId,
            listedPriceLkr: row.oldPrice,
            inStock: row.inStock,
            checkDate: checkDateParsed,
            changedById: userId,
          },
        });
      }

      await prisma.marketCompetitorLink.update({
        where: { id: row.existingLinkId },
        data: {
          productUrl: row.productUrl,
          competitorTitle: row.competitorTitle,
          packSizeNormalized: row.packSize,
          listedPriceLkr: row.priceLkr,
          inStock: row.inStock,
          checkDate: checkDateParsed,
          notes: row.notes,
          updatedById: userId,
        },
      });
    } else {
      // Create new
      await prisma.marketCompetitorLink.create({
        data: {
          companyId,
          sku: row.sku,
          competitorId: row.competitorId,
          productUrl: row.productUrl,
          competitorTitle: row.competitorTitle,
          packSizeNormalized: row.packSize,
          listedPriceLkr: row.priceLkr,
          inStock: row.inStock,
          checkDate: checkDateParsed,
          notes: row.notes,
          createdById: userId,
        },
      });
    }

    applied++;
  }

  return { applied };
}

import "server-only";

import { normalizePickListBarcode } from "@/lib/product-item-barcode";
import { prisma } from "@/lib/prisma";

type ErpConfig = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

type ErpItemPayload = {
  item_code?: string;
  barcodes?: Array<{ barcode?: string | null }>;
};

async function getErpConfigForCompany(companyId: string): Promise<ErpConfig | null> {
  const instance = await prisma.erpnextInstance.findFirst({
    where: { companyId },
    orderBy: { createdAt: "asc" },
  });
  if (!instance?.baseUrl || !instance.apiKey || !instance.apiSecret) return null;
  return {
    baseUrl: instance.baseUrl.replace(/\/$/, ""),
    apiKey: instance.apiKey,
    apiSecret: instance.apiSecret,
  };
}

function extractBarcodeFromErpItem(item: ErpItemPayload): string | null {
  for (const row of item.barcodes ?? []) {
    const normalized = normalizePickListBarcode(row.barcode);
    if (normalized) return normalized;
  }
  return null;
}

async function fetchErpBarcode(cfg: ErpConfig, sku: string): Promise<string | null> {
  try {
    const res = await fetch(`${cfg.baseUrl}/api/resource/Item/${encodeURIComponent(sku)}`, {
      headers: {
        Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: ErpItemPayload };
    return extractBarcodeFromErpItem(json.data ?? {});
  } catch (err) {
    console.warn(`[Barcode] ERPNext lookup failed for ${sku}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function loadBarcodeLookupFromDb(companyId: string, skus: string[]): Promise<Map<string, string>> {
  const rows = await prisma.productItem.findMany({
    where: {
      companyId,
      sku: { in: skus },
      barcode: { not: null },
    },
    select: { sku: true, barcode: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const map = new Map<string, string>();
  for (const row of rows) {
    const sku = row.sku?.trim();
    const barcode = normalizePickListBarcode(row.barcode);
    if (!sku || !barcode || map.has(sku)) continue;
    map.set(sku, barcode);
  }
  return map;
}

async function loadBarcodeLookupFromErp(companyId: string, skus: string[]): Promise<Map<string, string>> {
  const cfg = await getErpConfigForCompany(companyId);
  if (!cfg || skus.length === 0) return new Map();

  const map = new Map<string, string>();
  await Promise.all(
    skus.map(async (sku) => {
      const barcode = await fetchErpBarcode(cfg, sku);
      if (barcode) map.set(sku, barcode);
    }),
  );
  return map;
}

async function backfillProductItemBarcodes(companyId: string, barcodeBySku: ReadonlyMap<string, string>) {
  for (const [sku, barcode] of barcodeBySku) {
    await prisma.productItem.updateMany({
      where: { companyId, sku, barcode: null },
      data: { barcode: barcode.slice(0, 100) },
    });
  }
}

/** Find a barcode from catalog or ERPNext Item master. */
export async function findBarcodeForSku(
  companyId: string,
  sku: string | null | undefined,
): Promise<string | null> {
  const key = sku?.trim();
  if (!key) return null;

  const row = await prisma.productItem.findFirst({
    where: { companyId, sku: key, barcode: { not: null } },
    select: { barcode: true },
    orderBy: { updatedAt: "desc" },
  });
  const fromDb = normalizePickListBarcode(row?.barcode);
  if (fromDb) return fromDb;

  const cfg = await getErpConfigForCompany(companyId);
  if (!cfg) return null;

  const fromErp = await fetchErpBarcode(cfg, key);
  if (fromErp) {
    void backfillProductItemBarcodes(companyId, new Map([[key, fromErp]]));
  }
  return fromErp;
}

export async function loadBarcodeLookupBySku(
  companyId: string,
  skus: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return new Map();

  const map = await loadBarcodeLookupFromDb(companyId, unique);
  const missing = unique.filter((sku) => !map.has(sku));
  if (missing.length === 0) return map;

  const erpMap = await loadBarcodeLookupFromErp(companyId, missing);
  for (const [sku, barcode] of erpMap) {
    map.set(sku, barcode);
  }

  if (erpMap.size > 0) {
    void backfillProductItemBarcodes(companyId, erpMap);
  }

  return map;
}

import "server-only";

import { Decimal } from "@prisma/client/runtime/library";

import { prisma } from "@/lib/prisma";
import {
  getAllOsfErpInstances,
  OsfErpError,
  type OsfErpCredentials,
} from "@/lib/osf/erp-stock";
import {
  normalizeSkuKey,
  resolveErpSlots,
  resolveProductPriorityFieldName,
} from "@/lib/product-items/erp-priority-sync";
import { LIMITS } from "@/lib/validation";

/**
 * New/changed ERPNext Item → Cosmo ProductItem catalog sync (both ERP1 and ERP2).
 *
 * Unlike `erp-priority-sync.ts` (full-catalog pass, existing rows only), this is an
 * incremental poll (`modified >= since`) that can also create a catalog row for a SKU
 * Cosmo has never seen. See `syncErpItemCatalog` for the upsert strategy and gaps.
 */

/** Default lookback for incremental Item polling (mirrors `ERP_INBOUND_RECONCILE_LOOKBACK_DAYS`). */
export const ERP_ITEM_CATALOG_SYNC_LOOKBACK_DAYS = 14;

const PAGE_LENGTH = 500;
const MAX_PAGES = 80;

type ErpItemRow = {
  itemCode: string;
  itemName: string | null;
  disabled: boolean;
  barcode: string | null;
  priority: string | null;
};

async function erpGetJson<T>(cfg: OsfErpCredentials, path: string): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: {
      Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OsfErpError(`ERPNext GET ${path} [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export function lookbackModifiedSince(days: number, now = new Date()): string {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return since.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Paginate `/api/resource/Item` for one ERP instance, filtered to `modified >= sinceModified`.
 * Also requests `item_group`, `stock_uom`, `creation` per spec — not persisted yet (no matching
 * ProductItem column); only item_code/item_name/disabled/barcode/priority are written today.
 */
async function fetchErpItemsSince(
  cfg: OsfErpCredentials,
  sinceModified: string,
): Promise<{ rows: ErpItemRow[]; fieldName: string | null }> {
  const fieldName = await resolveProductPriorityFieldName(cfg);
  const fields = [
    "name",
    "item_code",
    "item_name",
    "item_group",
    "disabled",
    "barcode",
    "stock_uom",
    "creation",
    "modified",
    ...(fieldName ? [fieldName] : []),
  ];
  const filters = JSON.stringify([["modified", ">=", sinceModified]]);

  const rows: ErpItemRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/Item?filters=${encodeURIComponent(filters)}` +
      `&fields=${encodeURIComponent(JSON.stringify(fields))}` +
      `&limit_page_length=${PAGE_LENGTH}&limit_start=${page * PAGE_LENGTH}` +
      `&order_by=${encodeURIComponent("modified desc")}`;
    const json = await erpGetJson<{ data?: Array<Record<string, unknown>> }>(cfg, path);
    const batch = json.data ?? [];

    for (const raw of batch) {
      const itemCode = String(raw.item_code ?? raw.name ?? "").trim();
      if (!itemCode) continue;
      const priorityRaw = fieldName ? raw[fieldName] : null;
      rows.push({
        itemCode,
        itemName: typeof raw.item_name === "string" ? raw.item_name.trim() || null : null,
        disabled: Number(raw.disabled) === 1,
        barcode: typeof raw.barcode === "string" ? raw.barcode.trim() || null : null,
        priority: priorityRaw != null ? String(priorityRaw).trim() || null : null,
      });
    }

    if (batch.length < PAGE_LENGTH) break;
    if (page === MAX_PAGES - 1 && batch.length === PAGE_LENGTH) {
      throw new OsfErpError(
        `ERP Item poll exceeded ${MAX_PAGES * PAGE_LENGTH} rows in lookback window — raise MAX_PAGES or shrink lookback`,
      );
    }
  }
  return { rows, fieldName };
}

export type ErpItemCatalogSyncSource = {
  id: "erp1" | "erp2";
  label: string;
  status: "ok" | "failed" | "not_configured";
  itemCount: number | null;
  fieldName: string | null;
  error: string | null;
};

export type ErpItemCatalogSyncResult = {
  syncedAt: string;
  sources: ErpItemCatalogSyncSource[];
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  distinctSkus: number;
};

type SlotFetch =
  | { ok: true; label: string; instanceId: string; rows: ErpItemRow[]; fieldName: string | null }
  | { ok: false; label: string; instanceId: null; error: string; notConfigured?: boolean };

async function fetchSlot(
  instance: { id: string; label: string | null; cfg: OsfErpCredentials } | null,
  fallbackLabel: string,
  sinceModified: string,
): Promise<SlotFetch> {
  if (!instance) {
    return { ok: false, label: fallbackLabel, instanceId: null, error: "Not configured", notConfigured: true };
  }
  const label = (instance.label ?? "").trim() || fallbackLabel;
  try {
    const { rows, fieldName } = await fetchErpItemsSince(instance.cfg, sinceModified);
    return { ok: true, label, instanceId: instance.id, rows, fieldName };
  } catch (err) {
    const message = err instanceof Error ? err.message : "ERP fetch failed";
    return { ok: false, label, instanceId: null, error: message.slice(0, 300) };
  }
}

type MergedItem = {
  itemCode: string;
  itemName: string | null;
  barcode: string | null;
  erp1: { instanceId: string; priority: string | null } | null;
  erp2: { instanceId: string; priority: string | null } | null;
};

/** Resolve which CompanyLocation to attach a brand-new, ERP-only ProductItem to for an ERP instance. */
async function resolveLocationForInstance(
  companyId: string,
  instanceId: string,
): Promise<{ id: string; shopifyLocationId: string | null } | null> {
  return prisma.companyLocation.findFirst({
    where: { companyId, erpnextInstanceId: instanceId },
    orderBy: [{ isMainCompany: "desc" }, { createdAt: "asc" }],
    select: { id: true, shopifyLocationId: true },
  });
}

/**
 * Pull new/changed ERPNext Items (ERP1 + ERP2) and upsert them onto ProductItem.
 *
 * Upsert strategy (see summary below for why a plain "create ProductItem from ERP" isn't
 * straightforward — ProductItem is Shopify-shaped: shopifyProductId/shopifyVariantId/
 * shopifyLocationId and companyLocationId are all required, non-null):
 *  - Match existing rows by `companyId` + case-insensitive `sku` (mirrors erp-item-price-sync.ts).
 *    A SKU can exist on multiple ProductItem rows (one per location/variant) — priority fields
 *    are written to all of them, same as the full-catalog priority sync.
 *  - Existing row(s) found → UPDATE ONLY erp1ProductPriority/erp2ProductPriority (whichever ERP
 *    contributed this run) + erpPrioritySyncedAt, and fill `barcode` only where currently empty.
 *    Shopify-owned fields (title, price, status, tags, ...) are never touched.
 *  - No existing row → CREATE, following the same synthetic-identity convention already used
 *    for ERP-only rows in `erp-sales-invoice-ingest.ts`: shopifyProductId = shopifyVariantId =
 *    `erp-<SKU>`, categoryId = "Uncategorized", itemStatusCategory = "NEWLY_ADDED",
 *    price = 0 (backfilled by the existing Standard Selling price sync run alongside this).
 *    Needs a CompanyLocation mapped to that ERP instance (`erpnextInstanceId`) to source
 *    `companyLocationId`/`shopifyLocationId` from — if none is configured, the create is
 *    skipped and reported as an error so an admin can map a location.
 *  - Same SKU newly seen in both ERPs in one run → one ProductItem row, both erp1/erp2
 *    priority fields set from their respective instance.
 *  - Disabled ERP items (`disabled = 1`) are excluded entirely (no create, no priority update)
 *    from that ERP's contribution for this run — out of scope for "new arrivals" tracking in v1.
 *  - Incremental (lookback-scoped): unlike the full priority sync, a SKU not present in this
 *    run's batch is left untouched — never nulled out — since we only fetched a modified-since
 *    slice, not the whole catalog.
 */
export async function syncErpItemCatalog(
  companyId: string,
  options?: { lookbackDays?: number },
): Promise<ErpItemCatalogSyncResult> {
  const lookbackDays = options?.lookbackDays ?? ERP_ITEM_CATALOG_SYNC_LOOKBACK_DAYS;
  const sinceModified = lookbackModifiedSince(lookbackDays);

  const instances = await getAllOsfErpInstances(companyId);
  const slots = resolveErpSlots(instances);
  const erp1Inst = slots.erp1 ? instances.find((i) => i.id === slots.erp1!.id) ?? null : null;
  const erp2Inst = slots.erp2 ? instances.find((i) => i.id === slots.erp2!.id) ?? null : null;

  const [erp1Fetch, erp2Fetch] = await Promise.all([
    fetchSlot(erp1Inst, "ERP1", sinceModified),
    fetchSlot(erp2Inst, "ERP2", sinceModified),
  ]);

  const sources: ErpItemCatalogSyncSource[] = [];
  const pushSource = (id: "erp1" | "erp2", result: SlotFetch) => {
    if (!result.ok && result.notConfigured) {
      sources.push({ id, label: result.label, status: "not_configured", itemCount: null, fieldName: null, error: null });
      return;
    }
    if (result.ok) {
      sources.push({ id, label: result.label, status: "ok", itemCount: result.rows.length, fieldName: result.fieldName, error: null });
    } else {
      sources.push({ id, label: result.label, status: "failed", itemCount: null, fieldName: null, error: result.error });
    }
  };
  pushSource("erp1", erp1Fetch);
  pushSource("erp2", erp2Fetch);

  // Merge by normalized SKU — disabled rows are dropped per-slot before merging.
  const merged = new Map<string, MergedItem>();
  const disabledKeys = new Set<string>();
  const addRows = (slot: "erp1" | "erp2", instanceId: string | null, rows: ErpItemRow[]) => {
    if (!instanceId) return;
    for (const row of rows) {
      const key = normalizeSkuKey(row.itemCode);
      if (!key) continue;
      if (row.disabled) {
        disabledKeys.add(key);
        continue;
      }
      const entry = merged.get(key) ?? {
        itemCode: row.itemCode,
        itemName: row.itemName,
        barcode: row.barcode,
        erp1: null,
        erp2: null,
      };
      if (!entry.itemName && row.itemName) entry.itemName = row.itemName;
      if (!entry.barcode && row.barcode) entry.barcode = row.barcode;
      entry[slot] = { instanceId, priority: row.priority };
      merged.set(key, entry);
    }
  };
  if (erp1Fetch.ok) addRows("erp1", erp1Fetch.instanceId, erp1Fetch.rows);
  if (erp2Fetch.ok) addRows("erp2", erp2Fetch.instanceId, erp2Fetch.rows);

  let created = 0;
  let updated = 0;
  // Disabled in every slot it appeared in and never enabled elsewhere — excluded from v1.
  let skipped = Array.from(disabledKeys).filter((key) => !merged.has(key)).length;
  const errors: string[] = [];

  if (merged.size > 0) {
    const category = await prisma.category.upsert({
      where: { companyId_name: { companyId, name: "Uncategorized" } },
      create: { companyId, name: "Uncategorized" },
      update: {},
    });
    const locationCache = new Map<string, { id: string; shopifyLocationId: string | null } | null>();
    const locationFor = async (instanceId: string) => {
      if (!locationCache.has(instanceId)) {
        locationCache.set(instanceId, await resolveLocationForInstance(companyId, instanceId));
      }
      return locationCache.get(instanceId) ?? null;
    };

    for (const entry of merged.values()) {
      try {
        const priorityUpdate: {
          erp1ProductPriority?: string | null;
          erp2ProductPriority?: string | null;
          erpPrioritySyncedAt?: Date;
        } = {};
        if (entry.erp1) priorityUpdate.erp1ProductPriority = entry.erp1.priority;
        if (entry.erp2) priorityUpdate.erp2ProductPriority = entry.erp2.priority;
        if (entry.erp1 || entry.erp2) priorityUpdate.erpPrioritySyncedAt = new Date();

        const existing = await prisma.productItem.findMany({
          where: { companyId, sku: { equals: entry.itemCode, mode: "insensitive" } },
          select: { id: true, barcode: true },
        });

        if (existing.length > 0) {
          await prisma.productItem.updateMany({
            where: { id: { in: existing.map((r) => r.id) } },
            data: priorityUpdate,
          });
          if (entry.barcode) {
            const needBarcode = existing.filter((r) => !r.barcode).map((r) => r.id);
            if (needBarcode.length > 0) {
              await prisma.productItem.updateMany({
                where: { id: { in: needBarcode } },
                data: { barcode: entry.barcode.slice(0, 100) },
              });
            }
          }
          updated += 1;
          continue;
        }

        const primary = entry.erp1 ?? entry.erp2;
        const location = primary ? await locationFor(primary.instanceId) : null;
        if (!location) {
          skipped += 1;
          errors.push(
            `${entry.itemCode}: no CompanyLocation mapped to its ERP instance (set CompanyLocation.erpnextInstanceId) — skipped create`,
          );
          continue;
        }

        const syntheticVariantId = `erp-${normalizeSkuKey(entry.itemCode)}`;
        await prisma.productItem.upsert({
          where: {
            companyLocationId_shopifyVariantId: {
              companyLocationId: location.id,
              shopifyVariantId: syntheticVariantId,
            },
          },
          create: {
            companyId,
            companyLocationId: location.id,
            shopifyLocationId: location.shopifyLocationId ?? location.id,
            shopifyProductId: syntheticVariantId,
            shopifyVariantId: syntheticVariantId,
            productTitle: (entry.itemName ?? entry.itemCode).slice(0, LIMITS.productTitle.max),
            sku: entry.itemCode.slice(0, LIMITS.sku.max),
            barcode: entry.barcode?.slice(0, 100) ?? null,
            price: new Decimal(0),
            categoryId: category.id,
            itemStatusCategory: "NEWLY_ADDED",
            itemStatusLabel: "Newly Added",
            inventoryQuantity: 0,
            ...priorityUpdate,
          },
          update: priorityUpdate,
        });
        created += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upsert failed";
        errors.push(`${entry.itemCode}: ${message.slice(0, 200)}`);
      }
    }
  }

  return {
    syncedAt: new Date().toISOString(),
    sources,
    created,
    updated,
    skipped,
    errors,
    distinctSkus: merged.size,
  };
}

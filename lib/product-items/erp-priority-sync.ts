import "server-only";

import { prisma } from "@/lib/prisma";
import {
  getAllOsfErpInstances,
  OsfErpError,
  type OsfErpCredentials,
  type OsfErpInstance,
} from "@/lib/osf/erp-stock";

export {
  ERP_PRODUCT_PRIORITY_OPTIONS,
  mergeErpPriorityFilterOptions,
} from "@/lib/product-items/erp-priority-options";

const PAGE_LENGTH = 500;
const MAX_PAGES = 80;
const UPDATE_CHUNK = 200;

/** Candidate ERP Item field names for Manufacturing "Product Priority". */
export const ERP_PRODUCT_PRIORITY_FIELD_CANDIDATES = [
  "custom_product_priority",
  "product_priority",
  "custom_priority",
  "custom_item_priority",
  "custom_product_priority_level",
] as const;

export function normalizeSkuKey(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function resolveErpSlots(instances: Array<{ id: string; label: string | null }>): {
  erp1: { id: string; label: string | null } | null;
  erp2: { id: string; label: string | null } | null;
} {
  // Matches "ERP1", "ERP 1", "ERP_1", "ERP-1 - Main", etc.
  const erp1Match = instances.find((i) => /erp[_\s-]*1\b/i.test(i.label ?? ""));
  const erp2Match = instances.find((i) => /erp[_\s-]*2\b/i.test(i.label ?? ""));
  if (erp1Match || erp2Match) {
    return { erp1: erp1Match ?? null, erp2: erp2Match ?? null };
  }
  return {
    erp1: instances[0] ?? null,
    erp2: instances[1] ?? null,
  };
}

async function resolveProductPriorityFieldName(cfg: OsfErpCredentials): Promise<string | null> {
  try {
    const filters = JSON.stringify([
      ["dt", "=", "Item"],
      ["label", "like", "%Product Priority%"],
    ]);
    const fields = JSON.stringify(["fieldname", "label"]);
    const path =
      `/api/resource/Custom Field?filters=${encodeURIComponent(filters)}` +
      `&fields=${encodeURIComponent(fields)}&limit_page_length=20`;
    const json = await erpGetJson<{ data?: Array<{ fieldname?: string; label?: string }> }>(
      cfg,
      path,
    );
    const hit = (json.data ?? []).find((r) => r.fieldname?.trim());
    if (hit?.fieldname) return hit.fieldname.trim();
  } catch {
    // fall through to candidates
  }
  return "custom_product_priority";
}

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

function pickPriority(row: Record<string, unknown>, field: string | null): string | null {
  if (!field) return null;
  const value = row[field];
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

/**
 * Paginate Item catalog and return SKU → Product Priority.
 * Resolves fieldname via Custom Field (label Product Priority), default custom_product_priority.
 */
export async function fetchErpProductPriorities(
  cfg: OsfErpCredentials,
): Promise<{ bySku: Map<string, string | null>; fieldName: string | null }> {
  const bySku = new Map<string, string | null>();
  const fieldName = await resolveProductPriorityFieldName(cfg);
  const fields = ["name", "item_code", fieldName].filter(Boolean) as string[];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/Item?fields=${encodeURIComponent(JSON.stringify(fields))}` +
      `&limit_page_length=${PAGE_LENGTH}&limit_start=${page * PAGE_LENGTH}`;

    const json = await erpGetJson<{ data?: Array<Record<string, unknown>> }>(cfg, path);
    const rows = json.data ?? [];

    for (const row of rows) {
      const code = String(row.item_code ?? row.name ?? "").trim();
      if (!code) continue;
      bySku.set(normalizeSkuKey(code), pickPriority(row, fieldName));
    }

    if (rows.length < PAGE_LENGTH) break;
    if (page === MAX_PAGES - 1 && rows.length === PAGE_LENGTH) {
      throw new OsfErpError(
        `ERP Item catalog exceeded ${MAX_PAGES * PAGE_LENGTH} rows — raise MAX_PAGES`,
      );
    }
  }

  return { bySku, fieldName };
}

export type ErpPrioritySyncSource = {
  id: "erp1" | "erp2";
  label: string;
  status: "ok" | "failed" | "not_configured";
  itemCount: number | null;
  fieldName: string | null;
  error: string | null;
};

export type ErpPrioritySyncResult = {
  syncedAt: string;
  sources: ErpPrioritySyncSource[];
  updatedRows: number;
  distinctSkus: number;
};

type SlotFetch =
  | {
      ok: true;
      label: string;
      bySku: Map<string, string | null>;
      fieldName: string | null;
    }
  | { ok: false; label: string; error: string; notConfigured?: boolean };

async function fetchSlot(
  slot: OsfErpInstance | null,
  fallbackLabel: string,
): Promise<SlotFetch> {
  if (!slot) {
    return { ok: false, label: fallbackLabel, error: "Not configured", notConfigured: true };
  }
  const label = (slot.label ?? "").trim() || fallbackLabel;
  try {
    const { bySku, fieldName } = await fetchErpProductPriorities(slot.cfg);
    return { ok: true, label, bySku, fieldName };
  } catch (err) {
    const message = err instanceof Error ? err.message : "ERP fetch failed";
    return { ok: false, label, error: message.slice(0, 300) };
  }
}

/**
 * Pull Product Priority from ERP1/ERP2 and write onto all company ProductItems by SKU.
 * On ERP failure for a slot, leaves that column unchanged (does not invent / clear).
 * On ERP success, SKUs missing from that ERP get null for that column.
 */
export async function syncErpProductPriorities(companyId: string): Promise<ErpPrioritySyncResult> {
  const instances = await getAllOsfErpInstances(companyId);
  const slots = resolveErpSlots(instances);
  const erp1Inst = slots.erp1 ? (instances.find((i) => i.id === slots.erp1!.id) ?? null) : null;
  const erp2Inst = slots.erp2 ? (instances.find((i) => i.id === slots.erp2!.id) ?? null) : null;

  const [erp1Result, erp2Result] = await Promise.all([
    fetchSlot(erp1Inst, "ERP1"),
    fetchSlot(erp2Inst, "ERP2"),
  ]);

  const sources: ErpPrioritySyncSource[] = [];
  const push = (id: "erp1" | "erp2", result: SlotFetch) => {
    if (!result.ok && result.notConfigured) {
      sources.push({
        id,
        label: result.label,
        status: "not_configured",
        itemCount: null,
        fieldName: null,
        error: null,
      });
      return;
    }
    if (result.ok) {
      sources.push({
        id,
        label: result.label,
        status: "ok",
        itemCount: result.bySku.size,
        fieldName: result.fieldName,
        error: null,
      });
    } else {
      sources.push({
        id,
        label: result.label,
        status: "failed",
        itemCount: null,
        fieldName: null,
        error: result.error,
      });
    }
  };
  push("erp1", erp1Result);
  push("erp2", erp2Result);

  const osItems = await prisma.productItem.findMany({
    where: { companyId },
    select: { id: true, sku: true },
  });

  const syncedAt = new Date();
  let updatedRows = 0;
  const skuKeys = new Set<string>();

  // Group OS rows by normalized SKU for batched updates
  const byKey = new Map<string, string[]>();
  for (const item of osItems) {
    const key = normalizeSkuKey(item.sku);
    if (!key) continue;
    skuKeys.add(key);
    const list = byKey.get(key) ?? [];
    list.push(item.id);
    byKey.set(key, list);
  }

  const entries = Array.from(byKey.entries());
  for (let i = 0; i < entries.length; i += UPDATE_CHUNK) {
    const chunk = entries.slice(i, i + UPDATE_CHUNK);
    await Promise.all(
      chunk.map(async ([skuKey, ids]) => {
        const data: {
          erp1ProductPriority?: string | null;
          erp2ProductPriority?: string | null;
          erpPrioritySyncedAt: Date;
        } = { erpPrioritySyncedAt: syncedAt };

        if (erp1Result.ok && erp1Result.fieldName) {
          data.erp1ProductPriority = erp1Result.bySku.has(skuKey)
            ? erp1Result.bySku.get(skuKey) ?? null
            : null;
        }
        if (erp2Result.ok && erp2Result.fieldName) {
          data.erp2ProductPriority = erp2Result.bySku.has(skuKey)
            ? erp2Result.bySku.get(skuKey) ?? null
            : null;
        }

        // Skip write if neither ERP yielded a usable priority field
        if (
          !(erp1Result.ok && erp1Result.fieldName) &&
          !(erp2Result.ok && erp2Result.fieldName)
        ) {
          return;
        }

        const result = await prisma.productItem.updateMany({
          where: { companyId, id: { in: ids } },
          data,
        });
        updatedRows += result.count;
      }),
    );
  }

  return {
    syncedAt: syncedAt.toISOString(),
    sources,
    updatedRows,
    distinctSkus: skuKeys.size,
  };
}

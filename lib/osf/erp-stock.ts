import "server-only";

import { prisma } from "@/lib/prisma";

export type OsfErpCredentials = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

export class OsfErpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OsfErpError";
  }
}

export async function getOsfErpCredentials(companyId: string): Promise<OsfErpCredentials | null> {
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

export type OsfErpInstance = {
  id: string;
  label: string | null;
  cfg: OsfErpCredentials;
};

/**
 * All configured ERP instances for a company. Locations can live in different
 * ERP instances (e.g. Cosmetics.lk vs the trading companies), so OSF stock/cost
 * must be read from each location's own instance and merged.
 */
export async function getAllOsfErpInstances(companyId: string): Promise<OsfErpInstance[]> {
  const instances = await prisma.erpnextInstance.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
  });
  return instances
    .filter((i) => i.baseUrl && i.apiKey && i.apiSecret)
    .map((i) => ({
      id: i.id,
      label: i.label,
      cfg: {
        baseUrl: i.baseUrl.replace(/\/$/, ""),
        apiKey: i.apiKey as string,
        apiSecret: i.apiSecret as string,
      },
    }));
}

function authHeaders(cfg: OsfErpCredentials): Record<string, string> {
  return {
    Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
    Accept: "application/json",
  };
}

async function erpGetJson<T>(cfg: OsfErpCredentials, path: string): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: authHeaders(cfg),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OsfErpError(`ERPNext GET ${path} [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

const BIN_BATCH = 80;

/**
 * Batch-fetch Bin actual_qty keyed by `${warehouse}::${item_code}`.
 * Throws OsfErpError on unreachable ERP — callers must not invent stock.
 */
export async function fetchBinActualQty(input: {
  cfg: OsfErpCredentials;
  warehouses: string[];
  itemCodes: string[];
}): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const warehouses = [...new Set(input.warehouses.map((w) => w.trim()).filter(Boolean))];
  const items = [...new Set(input.itemCodes.map((s) => s.trim()).filter(Boolean))];
  if (warehouses.length === 0 || items.length === 0) return map;

  for (let i = 0; i < items.length; i += BIN_BATCH) {
    const batch = items.slice(i, i + BIN_BATCH);
    const filters = JSON.stringify([
      ["warehouse", "in", warehouses],
      ["item_code", "in", batch],
    ]);
    const fields = JSON.stringify(["item_code", "warehouse", "actual_qty"]);
    const path =
      `/api/resource/Bin?filters=${encodeURIComponent(filters)}` +
      `&fields=${encodeURIComponent(fields)}&limit_page_length=${BIN_BATCH * warehouses.length}`;

    const json = await erpGetJson<{ data?: Array<{ item_code?: string; warehouse?: string; actual_qty?: number }> }>(
      input.cfg,
      path,
    );
    for (const row of json.data ?? []) {
      const item = row.item_code?.trim();
      const wh = row.warehouse?.trim();
      if (!item || !wh) continue;
      const qty = Number(row.actual_qty);
      if (!Number.isFinite(qty)) continue;
      const key = `${wh}::${item}`;
      map.set(key, (map.get(key) ?? 0) + qty);
    }
  }

  return map;
}

export function stockForColumn(
  binMap: Map<string, number>,
  warehouses: string[],
  itemCode: string,
): number | null {
  if (warehouses.length === 0) return null;
  let total = 0;
  let found = false;
  for (const wh of warehouses) {
    const key = `${wh}::${itemCode}`;
    if (binMap.has(key)) {
      found = true;
      total += binMap.get(key)!;
    }
  }
  return found ? total : 0;
}

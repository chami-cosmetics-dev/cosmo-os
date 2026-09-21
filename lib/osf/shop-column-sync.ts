import "server-only";

import { isCosmeticsLkLocationName } from "@/lib/cosmetics-lk-location";
import { isShopWarehouseName } from "@/lib/item-trends/physical-shops";
import { getAllOsfErpInstances, OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";
import {
  cosmoShopKeyFromWarehouse,
  cosmoShopLabelFromWarehouse,
} from "@/lib/osf/shop-column-key";
import { prisma } from "@/lib/prisma";

export { cosmoShopKeyFromWarehouse, cosmoShopLabelFromWarehouse } from "@/lib/osf/shop-column-key";

const PAGE_LENGTH = 500;
const MAX_PAGES = 40;

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

async function listShopWarehousesForErpCompany(
  cfg: OsfErpCredentials,
  erpCompany: string,
): Promise<string[]> {
  const filters: unknown[] = [
    ["company", "=", erpCompany],
    ["is_group", "=", 0],
  ];
  const fields = encodeURIComponent(JSON.stringify(["name", "disabled"]));
  const filterQ = `&filters=${encodeURIComponent(JSON.stringify(filters))}`;
  const names: string[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/Warehouse?fields=${fields}` +
      `${filterQ}&limit_page_length=${PAGE_LENGTH}&limit_start=${page * PAGE_LENGTH}`;
    const json = await erpGetJson<{ data?: Array<{ name?: string; disabled?: number | boolean }> }>(
      cfg,
      path,
    );
    const rows = json.data ?? [];
    for (const row of rows) {
      if (row.disabled === 1 || row.disabled === true) continue;
      const name = String(row.name ?? "").trim();
      if (!isShopWarehouseName(name)) continue;
      names.push(name);
    }
    if (rows.length < PAGE_LENGTH) break;
  }
  return names;
}

export type EnsureCosmeticsShopColumnsResult = {
  created: string[];
  updated: string[];
  deactivated: string[];
  skipped: boolean;
  reason?: string;
};

/**
 * Upsert Cosmetics ERP1 shop warehouses as OSF shop columns (stock+ROP on).
 * Deactivates previously auto-managed cosmo_shop_* columns whose warehouse no longer qualifies.
 */
export async function ensureCosmeticsShopOsfColumns(
  companyId: string,
): Promise<EnsureCosmeticsShopColumnsResult> {
  const cosmoLoc = await prisma.companyLocation.findFirst({
    where: {
      companyId,
      OR: [
        { name: { contains: "Cosmetics.lk", mode: "insensitive" } },
        { shortName: { contains: "Cosmetics.lk", mode: "insensitive" } },
      ],
    },
    select: {
      name: true,
      shortName: true,
      erpnextInstanceId: true,
      erpnextCompany: true,
    },
  });

  if (!cosmoLoc || !isCosmeticsLkLocationName(cosmoLoc.name ?? cosmoLoc.shortName)) {
    return { created: [], updated: [], deactivated: [], skipped: true, reason: "no_cosmetics_lk" };
  }

  const instanceId = cosmoLoc.erpnextInstanceId;
  const erpCompany = cosmoLoc.erpnextCompany?.trim();
  if (!instanceId || !erpCompany) {
    return {
      created: [],
      updated: [],
      deactivated: [],
      skipped: true,
      reason: "missing_erp_mapping",
    };
  }

  const instances = await getAllOsfErpInstances(companyId);
  const inst = instances.find((i) => i.id === instanceId);
  if (!inst) {
    return {
      created: [],
      updated: [],
      deactivated: [],
      skipped: true,
      reason: "erp_instance_missing",
    };
  }

  let warehouses: string[];
  try {
    warehouses = await listShopWarehousesForErpCompany(inst.cfg, erpCompany);
  } catch (err) {
    if (err instanceof OsfErpError) throw err;
    throw err;
  }

  const existing = await prisma.osfColumnConfig.findMany({
    where: { companyId, key: { startsWith: "cosmo_shop_" } },
    select: {
      id: true,
      key: true,
      label: true,
      directWarehouses: true,
      active: true,
      sortOrder: true,
    },
  });

  const byWarehouse = new Map<string, (typeof existing)[number]>();
  const byKey = new Map(existing.map((c) => [c.key, c]));
  for (const col of existing) {
    for (const wh of col.directWarehouses) {
      const t = wh.trim();
      if (t) byWarehouse.set(t, col);
    }
  }

  const maxSort = Math.max(0, ...existing.map((c) => c.sortOrder), 10);
  let nextSort = maxSort + 1;
  const created: string[] = [];
  const updated: string[] = [];
  const seenKeys = new Set<string>();

  for (const warehouse of warehouses) {
    const key = cosmoShopKeyFromWarehouse(warehouse);
    const label = cosmoShopLabelFromWarehouse(warehouse);
    seenKeys.add(key);

    const match = byWarehouse.get(warehouse) ?? byKey.get(key);
    if (match) {
      await prisma.osfColumnConfig.update({
        where: { id: match.id },
        data: {
          key: match.key.startsWith("cosmo_shop_") ? match.key : key,
          label,
          companyLocationId: null,
          erpnextInstanceId: instanceId,
          directWarehouses: [warehouse],
          includeInStock: true,
          includeInRop: true,
          active: true,
        },
      });
      updated.push(match.key);
      seenKeys.add(match.key);
      continue;
    }

    await prisma.osfColumnConfig.create({
      data: {
        companyId,
        key,
        label,
        companyLocationId: null,
        erpnextInstanceId: instanceId,
        directWarehouses: [warehouse],
        includeInStock: true,
        includeInRop: true,
        sortOrder: nextSort,
        active: true,
      },
    });
    nextSort += 1;
    created.push(key);
  }

  const deactivated: string[] = [];
  for (const col of existing) {
    if (seenKeys.has(col.key)) continue;
    if (!col.active) continue;
    await prisma.osfColumnConfig.update({
      where: { id: col.id },
      data: { active: false },
    });
    deactivated.push(col.key);
  }

  return { created, updated, deactivated, skipped: false };
}

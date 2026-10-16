import "server-only";

import { prisma } from "@/lib/prisma";
import {
  loadTransferSlotWarehouses,
  MaterialTransferError,
  resolveTransferItemIdentity,
  searchTransferItemsByCode,
} from "@/lib/material-transfer/erp";
import {
  normalizeShopAvailability,
  resolveMainWarehouses,
  skuLookupKeys,
  stockCell,
  type ResolvedMain,
  type ShopAvailability,
  type ShopRequestStock,
} from "@/lib/material-transfer/shop-item-request";
import { fetchBinActualQty } from "@/lib/osf/erp-stock";
import type { TransferSlot, TransferWarehouse } from "@/lib/material-transfer/types";
import type { OsfErpCredentials } from "@/lib/osf/erp-stock";

export type ShopRequestIdentity = {
  itemCode: string;
  itemName: string;
  barcode: string;
  shopAvailability: ShopAvailability;
  stocks: ShopRequestStock[];
};

type SlotBundle = {
  slot: TransferSlot;
  cfg: OsfErpCredentials;
  warehouses: TransferWarehouse[];
};

async function loadSlots(companyId: string): Promise<SlotBundle[]> {
  const out: SlotBundle[] = [];
  const slots: TransferSlot[] = ["erp1", "erp2"];
  for (const slot of slots) {
    try {
      const loaded = await loadTransferSlotWarehouses(companyId, slot);
      out.push({ slot, cfg: loaded.instance.cfg, warehouses: loaded.warehouses });
    } catch (error) {
      if (error instanceof MaterialTransferError && error.message.includes("not configured")) continue;
      throw error;
    }
  }
  return out;
}

function stocksFromBins(
  resolved: ResolvedMain[],
  bins: Map<string, number>,
  failedSlots: Set<TransferSlot>,
  itemCode: string,
): ShopRequestStock[] {
  return resolved.map((column) => {
    if (!column.warehouse || failedSlots.has(column.slot)) {
      const cell = stockCell(null);
      return { key: column.key, label: column.label, ...cell };
    }
    const qty = bins.get(`${column.warehouse}::${itemCode}`) ?? 0;
    const cell = stockCell(qty);
    return { key: column.key, label: column.label, ...cell };
  });
}

export async function loadShopRequestStocks(
  companyId: string,
  itemCodes: string[],
): Promise<Map<string, ShopRequestStock[]>> {
  const codes = [...new Set(itemCodes.map((code) => code.trim()).filter(Boolean))];
  const slots = await loadSlots(companyId);
  const resolved = resolveMainWarehouses(
    slots.flatMap((slot) => slot.warehouses.map((row) => ({ ...row, slot: slot.slot }))),
  );
  const bins = new Map<string, number>();
  const failedSlots = new Set<TransferSlot>();
  await Promise.all(
    slots.map(async (slot) => {
      const warehouses = resolved
        .filter((column) => column.slot === slot.slot && column.warehouse)
        .map((column) => column.warehouse as string);
      if (warehouses.length === 0 || codes.length === 0) return;
      try {
        const loaded = await fetchBinActualQty({ cfg: slot.cfg, warehouses, itemCodes: codes });
        for (const [key, qty] of loaded) bins.set(key, qty);
      } catch {
        failedSlots.add(slot.slot);
      }
    }),
  );
  const map = new Map<string, ShopRequestStock[]>();
  for (const code of codes) map.set(code, stocksFromBins(resolved, bins, failedSlots, code));
  return map;
}

async function loadAvailabilities(
  companyId: string,
  itemCodes: string[],
): Promise<Map<string, ShopAvailability>> {
  const keys = [...new Set(itemCodes.flatMap((code) => skuLookupKeys(code)))];
  const map = new Map<string, ShopAvailability>();
  if (keys.length === 0) return map;
  const rows = await prisma.productOsfProfile.findMany({
    where: { companyId, sku: { in: keys } },
    select: { sku: true, shopAvailability: true },
  });
  for (const code of itemCodes) {
    const wanted = skuLookupKeys(code);
    const exact = rows.find((row) => row.sku === code.trim());
    const alt = rows.find((row) => wanted.includes(row.sku));
    map.set(code.trim(), normalizeShopAvailability((exact ?? alt)?.shopAvailability));
  }
  return map;
}

export async function suggestShopRequestItems(
  companyId: string,
  query: string,
): Promise<Array<{ itemCode: string; itemName: string }>> {
  const q = query.trim();
  if (q.length < 2) return [];
  const slots = await loadSlots(companyId);
  if (slots.length === 0) {
    throw new MaterialTransferError("ERP is not configured", 502);
  }
  const hits = new Map<string, { itemCode: string; itemName: string }>();
  let failures = 0;
  await Promise.all(
    slots.map(async (slot) => {
      try {
        const rows = await searchTransferItemsByCode(slot.cfg, q, 15);
        for (const row of rows) {
          if (!hits.has(row.itemCode)) hits.set(row.itemCode, row);
        }
      } catch {
        failures += 1;
      }
    }),
  );
  if (failures === slots.length) {
    throw new MaterialTransferError("Could not search items", 502);
  }
  return [...hits.values()].slice(0, 15);
}

async function identityForCode(
  slots: SlotBundle[],
  code: string,
  options?: { exactOnly?: boolean },
): Promise<{ itemCode: string; itemName: string; barcode: string }> {
  const found: Array<{ itemCode: string; itemName: string; barcode: string }> = [];
  let failures = 0;
  for (const slot of slots) {
    try {
      const identity = await resolveTransferItemIdentity(slot.cfg, code, options);
      if (identity) found.push(identity);
    } catch (error) {
      if (error instanceof MaterialTransferError) throw error;
      failures += 1;
    }
  }
  if (found.length === 0 && failures === slots.length) {
    throw new MaterialTransferError("Could not look up the item", 502);
  }
  const codes = new Set(found.map((row) => row.itemCode));
  if (codes.size === 0) throw new MaterialTransferError(`No item found for ${code}`, 404);
  if (codes.size > 1) throw new MaterialTransferError(`More than one item matches ${code}`, 409);
  const item = found[0]!;
  return {
    itemCode: item.itemCode,
    itemName: item.itemName,
    barcode: found.map((row) => row.barcode.trim()).find(Boolean) ?? "",
  };
}

export async function resolveShopRequestLines(
  companyId: string,
  codes: string[],
  options?: { exactOnly?: boolean },
): Promise<ShopRequestIdentity[]> {
  const slots = await loadSlots(companyId);
  if (slots.length === 0) throw new MaterialTransferError("ERP is not configured", 502);
  const identities = [];
  for (const code of codes) identities.push(await identityForCode(slots, code.trim(), options));
  const itemCodes = identities.map((row) => row.itemCode);
  const [availability, stocks] = await Promise.all([
    loadAvailabilities(companyId, itemCodes),
    loadShopRequestStocks(companyId, itemCodes),
  ]);
  return identities.map((row) => ({
    ...row,
    shopAvailability: availability.get(row.itemCode) ?? null,
    stocks: stocks.get(row.itemCode) ?? [],
  }));
}

export async function lookupShopRequestItem(
  companyId: string,
  code: string,
  options?: { exactOnly?: boolean },
): Promise<ShopRequestIdentity> {
  const [item] = await resolveShopRequestLines(companyId, [code], options);
  if (!item) throw new MaterialTransferError(`No item found for ${code.trim()}`, 404);
  return item;
}

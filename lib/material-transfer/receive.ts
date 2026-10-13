import { findTransferLine } from "@/lib/material-transfer/lines";

export type ReceiptLineRef = {
  itemCode: string;
  barcode: string;
};

export type ShopScope = {
  explicitWarehouses: string[];
  outletName: string | null;
};

const OUTLET_WORDS = new Set(["shop", "warehouse", "main", "stores", "store"]);

/**
 * ERP2 company code on the warehouse → Cosmetics outlet that receives it.
 * MNK Trading is Cool Planet. Other companies stay unmapped until decided.
 */
const ERP2_CODE_OUTLETS: Record<string, string> = {
  mnk: "cool planet",
};

function outletKey(outletName: string): string {
  return outletName
    .trim()
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/\s+/g, " ");
}

function outletMatchesAlias(outletName: string, alias: string): boolean {
  const outlet = outletKey(outletName);
  const compact = outlet.replace(/ /g, "");
  const aliasCompact = alias.replace(/ /g, "");
  return outlet === alias || compact === aliasCompact || outlet.startsWith(`${alias} `);
}

function warehouseCompanyCode(warehouse: string): string | null {
  const tokens = warehouse
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !OUTLET_WORDS.has(token));
  const code = tokens.at(-1);
  return code && ERP2_CODE_OUTLETS[code] ? code : null;
}

export function warehouseMatchesOutlet(warehouse: string, outletName: string | null | undefined): boolean {
  const outlet = (outletName ?? "").trim().toLowerCase();
  if (outlet.length < 2 || OUTLET_WORDS.has(outlet)) return false;
  const name = warehouse.trim().toLowerCase();
  if (!name) return false;
  if (name.includes(outlet)) return true;
  const tokens = name.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.includes(outlet)) return true;
  const code = warehouseCompanyCode(warehouse);
  const alias = code ? ERP2_CODE_OUTLETS[code] : undefined;
  return Boolean(alias && outletMatchesAlias(outlet, alias));
}

export function transferVisibleToShop(targetWarehouse: string, scope: ShopScope): boolean {
  const target = targetWarehouse.trim();
  if (!target) return false;
  if (scope.explicitWarehouses.some((name) => name.trim() === target)) return true;
  return warehouseMatchesOutlet(target, scope.outletName);
}

export function shopScopeIsEmpty(scope: ShopScope): boolean {
  return scope.explicitWarehouses.length === 0 && !(scope.outletName ?? "").trim();
}

export function findReceiptLine<T extends ReceiptLineRef>(lines: T[], code: string): T | undefined {
  const hit = findTransferLine(
    lines.map((line) => ({
      itemCode: line.itemCode,
      itemName: line.itemCode,
      barcode: line.barcode,
      uom: "Nos",
      qty: 0,
      availableQty: null,
    })),
    code,
  );
  if (!hit) return undefined;
  return lines.find((line) => line.itemCode === hit.itemCode);
}

export function receiptVariance(lines: Array<{ sentQty: number; receivedQty: number }>) {
  let shortUnits = 0;
  let overUnits = 0;
  let mismatchCount = 0;
  for (const line of lines) {
    const diff = line.receivedQty - line.sentQty;
    if (diff === 0) continue;
    mismatchCount += 1;
    if (diff < 0) shortUnits += -diff;
    else overUnits += diff;
  }
  return { mismatchCount, shortUnits, overUnits };
}

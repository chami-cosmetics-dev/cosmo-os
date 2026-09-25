import { isCosmeticsLkLocationName } from "@/lib/cosmetics-lk-location";
import type { OsfResolvedColumn } from "@/lib/osf/column-config";
import {
  isCosmeticsLkInternalShopColumn,
  isCosmeticsLkLocationColumn,
} from "@/lib/item-trends/physical-shops";
import { isShopOsfColumn } from "@/lib/store-allocation/osf-columns";

export function isCosmeticsLkRopColumn(
  col: Pick<
    OsfResolvedColumn,
    "key" | "label" | "companyLocationId" | "companyLocationName" | "warehouses" | "directWarehouses"
  >,
): boolean {
  if (isCosmeticsLkInternalShopColumn(col) || isShopOsfColumn(col)) return false;
  if (isCosmeticsLkLocationColumn(col)) return true;
  return (
    isCosmeticsLkLocationName(col.label) || isCosmeticsLkLocationName(col.companyLocationName)
  );
}

/** Cosmetics.lk POS shops only — trading shop floors stay off VAT OSF. */
export function isShopRopColumn(
  col: Pick<
    OsfResolvedColumn,
    "key" | "label" | "companyLocationId" | "companyLocationName" | "warehouses" | "directWarehouses"
  >,
): boolean {
  if (isCosmeticsLkRopColumn(col)) return false;
  return isCosmeticsLkInternalShopColumn(col);
}

/** Location columns allowed on VAT Items OSF: Cosmetics.lk + shops only. */
export function isVatLocationColumn(
  col: Pick<
    OsfResolvedColumn,
    "key" | "label" | "companyLocationId" | "companyLocationName" | "warehouses" | "directWarehouses"
  >,
): boolean {
  return isCosmeticsLkRopColumn(col) || isShopRopColumn(col);
}

/** Active includeInRop columns allowed on VAT OSF: Cosmetics.lk + shops only. */
export function selectVatRopColumns(columns: OsfResolvedColumn[]): OsfResolvedColumn[] {
  return columns.filter(
    (c) => c.active && c.includeInRop && isVatLocationColumn(c),
  );
}

/** Active includeInStock columns allowed on VAT OSF: Cosmetics.lk + shops only. */
export function selectVatStockColumns(columns: OsfResolvedColumn[]): OsfResolvedColumn[] {
  return columns.filter(
    (c) => c.active && c.includeInStock && isVatLocationColumn(c),
  );
}

export function findCosmeticsLkRopColumn(columns: OsfResolvedColumn[]): OsfResolvedColumn | null {
  const candidates = columns.filter((c) => c.active && c.includeInRop && isCosmeticsLkRopColumn(c));
  return candidates[0] ?? null;
}

/**
 * VAT Total ROP = Cosmetics.lk ROP only (shop ROPs excluded).
 * Returns 0 when Cosmetics.lk ROP missing (same as summing empty).
 */
export function totalRopForVat(
  rops: Record<string, number | null | undefined> | undefined,
  cosmeticsLkColumnKey: string | null,
): number {
  if (!cosmeticsLkColumnKey || !rops) return 0;
  const val = rops[cosmeticsLkColumnKey];
  if (val == null || !Number.isFinite(val)) return 0;
  return val;
}

/** Sum all listed column ROPs (Main / Non-VAT). */
export function totalRopForColumns(
  rops: Record<string, number | null | undefined> | undefined,
  columns: Array<{ key: string }>,
): number {
  if (!rops) return 0;
  let total = 0;
  for (const col of columns) {
    const val = rops[col.key];
    if (val != null && Number.isFinite(val)) total += val;
  }
  return total;
}

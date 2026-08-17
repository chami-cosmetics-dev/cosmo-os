import { parseDDMMYYYY } from "@/lib/sticker-dates";

export type StickerBatchRowFields = {
  locationId: string;
  itemCode: string;
  itemName: string;
  unitPrice: string;
  quantity: string;
  manufactureDate?: string;
  expireDate?: string;
};

function hasPositiveQuantity(value: string): boolean {
  const qty = Number.parseInt(value.trim(), 10);
  return Number.isFinite(qty) && qty >= 1;
}

function datesAreValid(row: StickerBatchRowFields): boolean {
  const mfgRaw = (row.manufactureDate ?? "").trim();
  const expRaw = (row.expireDate ?? "").trim();
  if (!mfgRaw && !expRaw) return true;
  const mfg = mfgRaw ? parseDDMMYYYY(mfgRaw) : null;
  const exp = expRaw ? parseDDMMYYYY(expRaw) : null;
  if (mfgRaw && !mfg) return false;
  if (expRaw && !exp) return false;
  if (mfg && exp && exp < mfg) return false;
  return true;
}

/** Location-only / leftover blank lines do not count as item rows. */
export function isBlankStickerBatchRow(row: StickerBatchRowFields): boolean {
  return (
    !row.itemCode.trim() &&
    !row.itemName.trim() &&
    !row.unitPrice.trim() &&
    !row.quantity.trim()
  );
}

export function isCompleteStickerBatchRow(row: StickerBatchRowFields): boolean {
  if (
    !row.locationId.trim() ||
    !row.itemCode.trim() ||
    !row.itemName.trim() ||
    !row.unitPrice.trim() ||
    !hasPositiveQuantity(row.quantity)
  ) {
    return false;
  }
  return datesAreValid(row);
}

/** Empty leftover rows do not block. Partially filled rows do. Need ≥1 complete row. */
export function stickerBatchRowsAllowSave(rows: StickerBatchRowFields[]): boolean {
  const nonBlank = rows.filter((row) => !isBlankStickerBatchRow(row));
  if (nonBlank.length === 0) return false;
  return nonBlank.every(isCompleteStickerBatchRow);
}

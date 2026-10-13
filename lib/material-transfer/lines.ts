import type { TransferLine, TransferLookupItem } from "@/lib/material-transfer/types";

const MAX_QTY = 100_000;

export function lineKey(itemCode: string): string {
  return itemCode.trim().toLowerCase();
}

function barcodeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Match a scan or typed SKU against a line already on the transfer. */
export function findTransferLine(lines: TransferLine[], code: string): TransferLine | undefined {
  const q = code.trim().toLowerCase();
  if (!q) return undefined;
  const digits = barcodeDigits(q);
  return lines.find((line) => {
    if (lineKey(line.itemCode) === q) return true;
    const barcode = line.barcode.trim().toLowerCase();
    if (barcode && barcode === q) return true;
    if (digits.length >= 6 && barcode && barcodeDigits(barcode) === digits) return true;
    return false;
  });
}

export type SendQtyResult = {
  lines: TransferLine[];
  rejected: "over_available" | null;
};

function withinAvailable(qty: number, availableQty: number | null): boolean {
  if (availableQty == null) return qty <= MAX_QTY;
  return qty <= availableQty;
}

export function upsertTransferLine(lines: TransferLine[], item: TransferLookupItem): SendQtyResult {
  const key = lineKey(item.itemCode);
  const idx = lines.findIndex((line) => lineKey(line.itemCode) === key);
  if (idx === -1) {
    if (!withinAvailable(1, item.availableQty)) return { lines, rejected: "over_available" };
    return {
      lines: [
        ...lines,
        {
          itemCode: item.itemCode.trim(),
          itemName: item.itemName.trim() || item.itemCode.trim(),
          barcode: item.barcode.trim(),
          uom: item.uom.trim() || "Nos",
          qty: 1,
          availableQty: item.availableQty,
        },
      ],
      rejected: null,
    };
  }
  const current = lines[idx]!;
  const availableQty = item.availableQty ?? current.availableQty;
  const nextQty = Math.min(MAX_QTY, current.qty + 1);
  if (!withinAvailable(nextQty, availableQty)) return { lines, rejected: "over_available" };
  return {
    lines: lines.map((line, index) => {
      if (index !== idx) return line;
      return {
        ...line,
        itemName: item.itemName.trim() || line.itemName,
        barcode: line.barcode.trim() || item.barcode.trim(),
        uom: line.uom.trim() || item.uom.trim() || "Nos",
        qty: nextQty,
        availableQty,
      };
    }),
    rejected: null,
  };
}

export function setTransferLineQty(
  lines: TransferLine[],
  itemCode: string,
  qty: number,
): SendQtyResult {
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { lines, rejected: null };
  const key = lineKey(itemCode);
  const current = lines.find((line) => lineKey(line.itemCode) === key);
  if (!current) return { lines, rejected: null };
  if (!withinAvailable(qty, current.availableQty)) return { lines, rejected: "over_available" };
  return {
    lines: lines.map((line) => (lineKey(line.itemCode) === key ? { ...line, qty } : line)),
    rejected: null,
  };
}

export function promoteTransferLine(lines: TransferLine[], itemCode: string): TransferLine[] {
  const key = lineKey(itemCode);
  const index = lines.findIndex((line) => lineKey(line.itemCode) === key);
  if (index <= 0) return lines;
  const next = lines.slice();
  const [hit] = next.splice(index, 1);
  next.unshift(hit!);
  return next;
}

export function removeTransferLine(lines: TransferLine[], itemCode: string): TransferLine[] {
  const key = lineKey(itemCode);
  return lines.filter((line) => lineKey(line.itemCode) !== key);
}

export function clearAvailableQty(lines: TransferLine[]): TransferLine[] {
  return lines.map((line) => ({ ...line, availableQty: null }));
}

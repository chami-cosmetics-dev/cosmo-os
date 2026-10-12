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

export function upsertTransferLine(lines: TransferLine[], item: TransferLookupItem): TransferLine[] {
  const key = lineKey(item.itemCode);
  const idx = lines.findIndex((line) => lineKey(line.itemCode) === key);
  if (idx === -1) {
    return [
      ...lines,
      {
        itemCode: item.itemCode.trim(),
        itemName: item.itemName.trim() || item.itemCode.trim(),
        barcode: item.barcode.trim(),
        uom: item.uom.trim() || "Nos",
        qty: 1,
        availableQty: item.availableQty,
      },
    ];
  }
  return lines.map((line, index) => {
    if (index !== idx) return line;
    return {
      ...line,
      itemName: item.itemName.trim() || line.itemName,
      barcode: line.barcode.trim() || item.barcode.trim(),
      uom: line.uom.trim() || item.uom.trim() || "Nos",
      qty: Math.min(MAX_QTY, line.qty + 1),
      availableQty: item.availableQty ?? line.availableQty,
    };
  });
}

export function setTransferLineQty(
  lines: TransferLine[],
  itemCode: string,
  qty: number,
): TransferLine[] {
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return lines;
  const key = lineKey(itemCode);
  return lines.map((line) => (lineKey(line.itemCode) === key ? { ...line, qty } : line));
}

export function removeTransferLine(lines: TransferLine[], itemCode: string): TransferLine[] {
  const key = lineKey(itemCode);
  return lines.filter((line) => lineKey(line.itemCode) !== key);
}

export function clearAvailableQty(lines: TransferLine[]): TransferLine[] {
  return lines.map((line) => ({ ...line, availableQty: null }));
}

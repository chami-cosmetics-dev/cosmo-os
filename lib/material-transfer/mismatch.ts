const FINISHED = new Set(["received", "confirmed"]);

export function isMismatchTransfer(row: {
  status: string;
  lines: Array<{ sentQty: number; receivedQty: number }>;
}): boolean {
  if (!FINISHED.has(row.status)) return false;
  return row.lines.some((line) => line.receivedQty !== line.sentQty);
}

import { isApprovalSplitRequestNote } from "@/lib/approval-payment-split";

export function parseApprovalRequestNote(requestNote: string | null | undefined) {
  const note = requestNote?.trim() ?? "";
  if (note.startsWith("{")) return { paymentType: null, amount: null };
  const firstLine = note.split(/\r?\n/, 1)[0] ?? "";
  const match = firstLine.match(/^(.+?)\s+—\s+amount:\s+(.+)$/i);
  if (!match) {
    return { paymentType: note || null, amount: null };
  }
  return {
    paymentType: isApprovalSplitRequestNote(note) ? "Split Payment" : match[1].trim() || null,
    amount: match[2].trim() || null,
  };
}

export function enrichApprovalDisplay<T extends {
  orderId: string | null;
  invoiceNo: string | null;
  totalPrice: string | null;
  requestNote: string | null;
  orderLinked?: boolean;
}>(row: T) {
  const parsed = parseApprovalRequestNote(row.requestNote);
  const orderMissing = !row.orderId || row.orderLinked === false;

  return {
    ...row,
    orderMissing,
    invoiceNo: row.invoiceNo ?? (orderMissing ? "Order removed" : null),
    totalPrice: row.totalPrice ?? parsed.amount,
    paymentTypeLabel: parsed.paymentType,
  };
}

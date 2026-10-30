/** SMS cancel report: voided orders, dated by cancelledAt. Replacement cancels skipped. */

export function isVoidedFinancialStatus(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "voided";
}

/** Paid void that posted an ERP credit note — hits Sales on CN posting date. */
export function isSmsCreditNoteCancel(order: {
  erpReturnSalesInvoiceIds?: string[] | null;
}): boolean {
  return (order.erpReturnSalesInvoiceIds ?? []).some((id) => id.trim().length > 0);
}

/** Cancel that was replaced — do not add to SMS cancel totals. */
export function isReplacementCancel(order: {
  replacedByOrderId?: string | null;
  cancelKind?: string | null;
}): boolean {
  if (order.replacedByOrderId?.trim()) return true;
  return order.cancelKind === "replacement";
}

export function smsCancelMatchesDayPriorPlaced(
  placedYmd: string,
  cancelYmd: string,
  reportDate: string,
): boolean {
  return cancelYmd === reportDate && placedYmd < reportDate;
}

export function smsCancelMatchesMtdPriorMonth(
  placedYmd: string,
  cancelYmd: string,
  mtdFromYmd: string,
  reportDate: string,
): boolean {
  return (
    cancelYmd >= mtdFromYmd &&
    cancelYmd <= reportDate &&
    placedYmd < mtdFromYmd
  );
}

export function smsCancelMatchesMtdInRange(
  placedYmd: string,
  cancelYmd: string,
  mtdFromYmd: string,
  reportDate: string,
): boolean {
  return (
    placedYmd >= mtdFromYmd &&
    placedYmd <= reportDate &&
    cancelYmd >= mtdFromYmd &&
    cancelYmd <= reportDate
  );
}

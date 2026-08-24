export type PaymentEntryDirection = "Receive" | "Pay";

export type PaymentEntryReference = {
  reference_doctype: string;
  reference_name: string;
  allocated_amount?: number | null;
};

export type StoredOrderPayment = {
  paymentType: string;
  allocatedAmount: number | string | { toString(): string };
};

export type OrderPaymentSummary = {
  incomingPaid: number;
  refunds: number;
  netPaid: number;
  balance: number;
};

export type DisplayOrderPayment = {
  paymentType: string;
  modeOfPayment: string;
  allocatedAmount: number | string | { toString(): string };
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isPaymentEntryDirection(value: string | null | undefined): value is PaymentEntryDirection {
  return value === "Receive" || value === "Pay";
}

export function signedPaymentAmount(value: number, paymentType: PaymentEntryDirection): number {
  const absolute = Math.abs(value);
  return paymentType === "Pay" ? -absolute : absolute;
}

export function groupSalesInvoiceAllocations(
  references: PaymentEntryReference[],
): Array<{ invoiceName: string; allocatedAmount: number }> {
  const allocations = new Map<string, number>();

  for (const reference of references) {
    if (reference.reference_doctype !== "Sales Invoice") continue;
    const invoiceName = reference.reference_name.trim();
    if (!invoiceName) continue;
    const amount = reference.allocated_amount ?? 0;
    if (!Number.isFinite(amount)) continue;
    allocations.set(invoiceName, roundMoney((allocations.get(invoiceName) ?? 0) + amount));
  }

  return Array.from(allocations, ([invoiceName, allocatedAmount]) => ({
    invoiceName,
    allocatedAmount,
  }));
}

export function summarizeOrderPayments(
  payments: StoredOrderPayment[],
  invoiceTotal: number,
): OrderPaymentSummary {
  let incomingPaid = 0;
  let refunds = 0;

  for (const payment of payments) {
    const amount = Number(payment.allocatedAmount);
    if (!Number.isFinite(amount)) continue;
    if (payment.paymentType === "Pay" || amount < 0) {
      refunds += Math.abs(amount);
    } else {
      incomingPaid += amount;
    }
  }

  incomingPaid = roundMoney(incomingPaid);
  refunds = roundMoney(refunds);
  const netPaid = roundMoney(incomingPaid - refunds);
  const balance = roundMoney(Math.max(invoiceTotal - netPaid, 0));

  return { incomingPaid, refunds, netPaid, balance };
}

export function resolveOrderPaymentFinancialStatus(input: {
  currentStatus: string | null;
  outstandingAmount: number | null;
  incomingPaid: number;
  netPaid: number;
  invoiceTotal: number;
}): string {
  if (input.currentStatus?.toLowerCase() === "voided") return "voided";

  if (input.outstandingAmount !== null) {
    if (input.outstandingAmount <= 0.005) return "paid";
    return input.incomingPaid > 0.005 ? "partially_paid" : "pending";
  }

  if (input.netPaid >= input.invoiceTotal - 0.005 && input.invoiceTotal > 0) return "paid";
  if (input.incomingPaid > 0.005) return "partially_paid";
  return "pending";
}

export function formatOrderPaymentAmount(
  value: number | string | { toString(): string },
  currency?: string | null,
): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  const sign = amount < 0 ? "-" : "";
  const formatted = Math.abs(amount).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const currencyLabel = !currency || currency.toUpperCase() === "LKR" ? "Rs" : currency;
  return `${sign}${currencyLabel} ${formatted}`;
}

export function formatOrderPaymentBreakdown(
  payments: DisplayOrderPayment[],
  currency?: string | null,
): string {
  return payments
    .map((payment) => {
      const refundLabel = payment.paymentType === "Pay" ? " refund" : "";
      return `${payment.modeOfPayment}${refundLabel} ${formatOrderPaymentAmount(
        payment.allocatedAmount,
        currency,
      )}`;
    })
    .join(" + ");
}

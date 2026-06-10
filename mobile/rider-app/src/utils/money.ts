export function parseMoney(value: string | null | undefined) {
  const amount = Number.parseFloat(value ?? "");
  return Number.isFinite(amount) ? amount : 0;
}

export function formatMoney(value: string | null | undefined, currency?: string | null) {
  const amount = parseMoney(value);
  const formatted = amount.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `Rs. ${formatted} ${currency}` : `Rs. ${formatted}`;
}

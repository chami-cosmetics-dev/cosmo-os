/** Catalog amount for pick lists. Zero and blank stay empty. */
export function pickListMoneyAmount(
  value: string | number | { toString(): string } | null | undefined,
): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

export function formatPickListMoney(amount: string | null | undefined): string {
  if (!amount) return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

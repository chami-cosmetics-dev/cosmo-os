export function isShopifyOrderFullyRefunded(
  financialStatus: string | null | undefined,
): boolean {
  return financialStatus?.trim().toLowerCase() === "refunded";
}

export function shouldVoidShopifyOrder(input: {
  financialStatus?: string | null;
  cancelledAt?: string | null;
  totalPriceIsNegative?: boolean;
}): boolean {
  const status = input.financialStatus?.trim().toLowerCase();
  return (
    Boolean(input.cancelledAt?.trim()) ||
    status === "voided" ||
    status === "refunded" ||
    input.totalPriceIsNegative === true
  );
}

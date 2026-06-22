type OrderLineItemPriceProps = {
  salePrice: string;
  originalPrice?: string | null;
  formatPrice: (amount: string, currency?: string | null) => string;
  currency?: string | null;
  className?: string;
};

export function OrderLineItemPrice({
  salePrice,
  formatPrice,
  currency,
  className,
}: OrderLineItemPriceProps) {
  return <span className={className}>{formatPrice(salePrice, currency)}</span>;
}

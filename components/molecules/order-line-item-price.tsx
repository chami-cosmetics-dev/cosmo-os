type OrderLineItemPriceProps = {
  salePrice: string;
  originalPrice?: string | null;
  formatPrice: (amount: string, currency?: string | null) => string;
  currency?: string | null;
  className?: string;
};

export function OrderLineItemPrice({
  salePrice,
  originalPrice,
  formatPrice,
  currency,
  className,
}: OrderLineItemPriceProps) {
  const hasDiscount =
    originalPrice != null &&
    parseFloat(originalPrice) > parseFloat(salePrice);

  if (!hasDiscount) {
    return <span className={className}>{formatPrice(salePrice, currency)}</span>;
  }

  return (
    <span className={className}>
      <span className="block text-muted-foreground line-through">
        {formatPrice(originalPrice, currency)}
      </span>
      <span className="block">{formatPrice(salePrice, currency)}</span>
    </span>
  );
}

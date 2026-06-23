import { OrderShippingLine } from "@/components/molecules/order-shipping-line";
import { resolveOrderDisplayTotal } from "@/lib/order-shipping-display";

type OrderLineItemsTotalsProps = {
  subtotalOriginal?: string | null;
  subtotalSale?: string | null;
  discountCouponCode?: string | null;
  discountTotal?: string | null;
  totalShipping?: string | null;
  shippingRuleLabel?: string | null;
  totalPrice: string;
  currency?: string | null;
  formatPrice: (amount: string, currency?: string | null) => string;
};

export function OrderLineItemsTotals({
  subtotalOriginal,
  subtotalSale,
  discountCouponCode,
  discountTotal,
  totalShipping,
  shippingRuleLabel,
  totalPrice,
  currency,
  formatPrice,
}: OrderLineItemsTotalsProps) {
  const discountAmount = discountTotal != null ? parseFloat(discountTotal) : 0;
  const showDiscount = discountAmount > 0 && (discountCouponCode || subtotalOriginal);
  const displayTotal = resolveOrderDisplayTotal({
    totalPrice,
    subtotalSale: subtotalSale ?? subtotalOriginal,
    totalShipping,
  });

  return (
    <div className="mt-1 space-y-1 text-right text-sm text-muted-foreground">
      {subtotalOriginal && parseFloat(subtotalOriginal) > 0 && (
        <p>Subtotal: {formatPrice(subtotalOriginal, currency)}</p>
      )}
      {showDiscount && (
        <p>
          Coupon{discountCouponCode ? ` (${discountCouponCode})` : ""}: −
          {formatPrice(discountTotal!, currency)}
        </p>
      )}
      {subtotalSale &&
        subtotalOriginal &&
        parseFloat(subtotalOriginal) > parseFloat(subtotalSale) && (
          <p>After discount: {formatPrice(subtotalSale, currency)}</p>
        )}
      {!subtotalOriginal && discountCouponCode && !showDiscount && (
        <p>Coupon: {discountCouponCode}</p>
      )}
      <OrderShippingLine
        shippingRuleLabel={shippingRuleLabel}
        totalShipping={totalShipping}
        currency={currency}
        formatPrice={formatPrice}
      />
      <p className="mt-2 font-medium text-foreground">
        Total: {formatPrice(displayTotal, currency)}
      </p>
    </div>
  );
}

import { formatOrderShippingDetail, type OrderShippingDisplay } from "@/lib/order-shipping-display";

type OrderShippingLineProps = {
  shippingRuleLabel?: string | null;
  totalShipping?: string | null;
  currency?: string | null;
  formatPrice: (amount: string, currency?: string | null) => string;
  className?: string;
  prefix?: string;
};

export function OrderShippingLine({
  shippingRuleLabel,
  totalShipping,
  currency,
  formatPrice,
  className,
  prefix,
}: OrderShippingLineProps) {
  const display: OrderShippingDisplay = {
    label: shippingRuleLabel ?? null,
    amount: totalShipping ?? null,
  };
  const text = formatOrderShippingDetail(display, formatPrice, currency);
  if (!text) return null;

  return (
    <p className={className}>
      {prefix ? (
        <>
          <span className="font-medium">{prefix}</span> {text}
        </>
      ) : (
        text
      )}
    </p>
  );
}

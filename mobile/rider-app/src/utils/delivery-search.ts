import type { TenantMobileDelivery } from "@/src/types";

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function matchesDeliverySearch(delivery: TenantMobileDelivery, rawQuery: string) {
  const query = normalize(rawQuery);
  if (!query) return true;

  const queryDigits = digitsOnly(query);
  const orderNumber = normalize(delivery.orderNumber);
  const orderLabel = normalize(delivery.orderLabel);
  const customerName = normalize(delivery.customerName);
  const customerPhone = normalize(delivery.customerPhone);

  const haystacks = [orderNumber, orderLabel, customerName, customerPhone];
  if (haystacks.some((value) => value.includes(query))) {
    return true;
  }

  // Rider shorthand: searching last 4 digits of order number/label.
  if (queryDigits.length >= 2 && queryDigits.length <= 4) {
    const orderNumberDigits = digitsOnly(orderNumber);
    const orderLabelDigits = digitsOnly(orderLabel);
    if (
      orderNumberDigits.endsWith(queryDigits) ||
      orderLabelDigits.endsWith(queryDigits)
    ) {
      return true;
    }
  }

  return false;
}


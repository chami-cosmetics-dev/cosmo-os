import {
  buildErpOrderShippingFields,
  normalizeZeroValueShippingLabel,
  resolveOrderShippingDisplay,
  type OrderShippingDisplay,
} from "@/lib/order-shipping-display";
import { orderHasFreeShippingCoupon } from "@/lib/shopify-discount-codes";

type ShippingLineRow = {
  title?: string | null;
  code?: string | null;
};

export function isPlaceholderShippingRule(label: string | null | undefined): boolean {
  const trimmed = label?.trim();
  if (!trimmed) return true;
  return trimmed.toLowerCase() === "none";
}

function readShippingLineRows(shippingLines: unknown): ShippingLineRow[] {
  if (!Array.isArray(shippingLines)) return [];
  return shippingLines.filter((row): row is ShippingLineRow => !!row && typeof row === "object");
}

function unwrapErpPayload(rawPayload: unknown): Record<string, unknown> | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const top = rawPayload as Record<string, unknown>;
  if (top.data && typeof top.data === "object" && !Array.isArray(top.data)) {
    return top.data as Record<string, unknown>;
  }
  return top;
}

export function hasStoredDumpShippingResolution(input: {
  shippingLines?: unknown;
  rawPayload?: unknown;
  sourceName?: string | null;
  discountCodes?: unknown;
  dispatchedToCustomer?: boolean | null;
}): boolean {
  if (input.dispatchedToCustomer) return true;
  if (orderHasFreeShippingCoupon(input.discountCodes)) return true;
  if (readShippingLineRows(input.shippingLines).length > 0) return true;
  const source = input.sourceName?.toLowerCase() ?? "";
  if (source === "erpnext" || source === "erpnext-pos") {
    const payload = unwrapErpPayload(input.rawPayload);
    if (typeof payload?.shipping_rule === "string") return true;
  }
  return false;
}

export function dumpInvoiceShippingRuleFromStored(input: {
  totalShipping?: string | number | null;
  shippingLines?: unknown;
  rawPayload?: unknown;
  sourceName?: string | null;
  discountCodes?: unknown;
  dispatchedToCustomer?: boolean | null;
  shippingAddress?: string;
}): string {
  if (orderHasFreeShippingCoupon(input.discountCodes)) return "FREESHIP";

  const lines = readShippingLineRows(input.shippingLines);
  if (lines.length > 0) {
    const raw = (lines[0]?.title ?? lines[0]?.code ?? "").trim();
    if (!isPlaceholderShippingRule(raw)) {
      return normalizeZeroValueShippingLabel(raw) ?? raw;
    }
  } else {
    const display = resolveOrderShippingDisplay(input);
    if (display.label?.trim() && !isPlaceholderShippingRule(display.label)) {
      return display.label.trim();
    }
  }

  if (input.dispatchedToCustomer) return "Pick Up";
  return normalizeZeroValueShippingLabel(input.shippingAddress ?? null) ?? "";
}

export function dumpInvoiceShippingRuleFromLive(
  live: OrderShippingDisplay,
  fallback: string,
): string {
  if (live.label?.trim() && !isPlaceholderShippingRule(live.label)) {
    return live.label.trim();
  }
  return fallback;
}

export function dumpShippingPersistFields(display: OrderShippingDisplay) {
  const label = display.label?.trim() || "";
  if (!label && !display.amount) return null;
  const rule = isPlaceholderShippingRule(label) ? "None" : label;
  return buildErpOrderShippingFields({
    shipping_rule: rule,
    total_taxes_and_charges: display.amount ? Number(display.amount) : null,
  });
}

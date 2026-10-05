import { APP_TIME_ZONE } from "@/lib/format-datetime";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";

/** Lookback for KOKO duplicate grouping and soft notices (calendar days). */
export const KOKO_DUPLICATE_LOOKBACK_DAYS = 30;

/**
 * KOKO link-time confirm applies only on Cosmo OS, and only to orders created
 * on/after this instant (2026-09-19 00:00 Asia/Colombo — feature ship day).
 * Vault OS keeps the pre-feature finance/fulfillment path. Cosmo backlog before
 * the cutoff is also exempt.
 */
export const KOKO_LINK_TIME_FEATURE_CUTOFF = new Date("2026-09-18T18:30:00.000Z");

export const FINANCE_CANCEL_KOKO_DUPLICATE_PERMISSION =
  "finance.approvals.cancel_koko_duplicate" as const;

const ERP_SOURCE_PREFIXES = ["erpnext", "erpnext-pos", "pos"] as const;

/** Cosmo-only feature flag for the KOKO portal link-time confirm flow. */
export function isKokoLinkTimeFeatureEnabled(
  options?: { vaultOs?: boolean },
): boolean {
  const vaultOs = options?.vaultOs ?? isVaultOsDeployment();
  return !vaultOs;
}

/**
 * True when this deployment + order.createdAt should use link-time confirm.
 * Vault OS always false; Cosmo requires createdAt on/after the feature cutoff.
 */
export function isOrderSubjectToKokoLinkTimeFeature(
  createdAt: Date | string | null | undefined,
  options?: { vaultOs?: boolean },
): boolean {
  if (!isKokoLinkTimeFeatureEnabled(options)) return false;
  if (createdAt == null || createdAt === "") return false;
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() >= KOKO_LINK_TIME_FEATURE_CUTOFF.getTime();
}

export function isErpSourcedOrder(sourceName: string | null | undefined): boolean {
  const s = (sourceName ?? "").trim().toLowerCase();
  if (!s) return false;
  return (
    s === "erpnext" ||
    s.startsWith("erpnext") ||
    s === "pos" ||
    ERP_SOURCE_PREFIXES.some((p) => s === p)
  );
}

/** True when payment primary (preferred) or names indicate KOKO. */
export function isKokoPaymentGateway(order: {
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
}): boolean {
  const primary = order.paymentGatewayPrimary?.toLowerCase().trim();
  if (primary) return primary.includes("koko");
  const names = (order.paymentGatewayNames ?? [])
    .map((g) => g.toLowerCase().trim())
    .filter(Boolean);
  return names.some((g) => g.includes("koko"));
}

/** Shopify / web storefront orders (Cosmo + Vault). */
export function isShopifySourcedOrder(sourceName: string | null | undefined): boolean {
  const s = (sourceName ?? "").trim().toLowerCase();
  if (!s) return false;
  return s === "web" || s === "shopify" || s.startsWith("shopify");
}

/** ERP or Shopify — both capture KOKO portal link generated time before finance. */
export function isKokoLinkTimeEligibleSource(sourceName: string | null | undefined): boolean {
  return isErpSourcedOrder(sourceName) || isShopifySourcedOrder(sourceName);
}

/** ERP-sourced KOKO orders (legacy helper; prefer isKokoLinkTimeCandidate). */
export function isErpKokoOrder(order: {
  sourceName?: string | null;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
}): boolean {
  return isErpSourcedOrder(order.sourceName) && isKokoPaymentGateway(order);
}

type KokoLinkTimeSplitFlags = {
  /** True when pending/approved payment approval has a KOKO split line. */
  hasKokoSplitLeg?: boolean | null;
  /** True when a two-method split plan exists (KOKO/bank/cash). */
  hasSplitPaymentPlan?: boolean | null;
};

/**
 * True when this order must collect KOKO link generated time (Cosmo only):
 * ERP/Shopify KOKO primary, or a split plan with a KOKO leg,
 * and order is on/after the feature cutoff.
 * A split without KOKO (Bank Transfer + Cash) skips link time even if the
 * original gateway was KOKO.
 */
export function isKokoLinkTimeCandidate(
  order: {
    sourceName?: string | null;
    paymentGatewayPrimary?: string | null;
    paymentGatewayNames?: string[] | null;
    createdAt?: Date | string | null;
  } & KokoLinkTimeSplitFlags,
  options?: { vaultOs?: boolean },
): boolean {
  if (!isOrderSubjectToKokoLinkTimeFeature(order.createdAt, options)) return false;
  if (!isKokoLinkTimeEligibleSource(order.sourceName)) return false;
  if (order.hasSplitPaymentPlan) return Boolean(order.hasKokoSplitLeg);
  return isKokoPaymentGateway(order) || Boolean(order.hasKokoSplitLeg);
}

export function needsKokoLinkTimeConfirm(
  order: {
    sourceName?: string | null;
    paymentGatewayPrimary?: string | null;
    paymentGatewayNames?: string[] | null;
    kokoLinkTimeConfirmedAt?: Date | string | null;
    cancelledAt?: Date | string | null;
    financialStatus?: string | null;
    createdAt?: Date | string | null;
    /** When finance already approved, link-time is not required to proceed. */
    paymentApprovalStatus?: string | null;
  } & KokoLinkTimeSplitFlags,
  options?: { vaultOs?: boolean },
): boolean {
  if (!isKokoLinkTimeCandidate(order, options)) return false;
  if (order.cancelledAt) return false;
  if ((order.financialStatus ?? "").toLowerCase() === "voided") return false;
  if (order.paymentApprovalStatus === "approved") return false;
  return order.kokoLinkTimeConfirmedAt == null;
}

export function canEditKokoLinkTime(
  order: {
    sourceName?: string | null;
    paymentGatewayPrimary?: string | null;
    paymentGatewayNames?: string[] | null;
    cancelledAt?: Date | string | null;
    financialStatus?: string | null;
    paymentApprovalStatus?: string | null;
    createdAt?: Date | string | null;
  } & KokoLinkTimeSplitFlags,
  options?: { vaultOs?: boolean },
): boolean {
  if (!isKokoLinkTimeCandidate(order, options)) return false;
  if (order.cancelledAt) return false;
  if ((order.financialStatus ?? "").toLowerCase() === "voided") return false;
  if (order.paymentApprovalStatus === "approved") return false;
  return true;
}

/** Whether source supports merchant split payment planning. */
export function isSplitPaymentEligibleSource(sourceName: string | null | undefined): boolean {
  return isErpSourcedOrder(sourceName) || isShopifySourcedOrder(sourceName);
}

/** Sri Lanka has no DST, so Colombo wall time is always UTC+5:30. */
const COLOMBO_OFFSET_MINUTES = 5 * 60 + 30;

function colomboWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  // Reject impossible calendar dates (e.g. 31 Feb) instead of letting them roll over.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  const date = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second) - COLOMBO_OFFSET_MINUTES * 60_000,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function applyMeridiem(hour: number, meridiem: string | undefined): number | null {
  if (!meridiem) return hour;
  const m = meridiem.toLowerCase();
  if (hour < 1 || hour > 12) return null;
  if (m.startsWith("p")) return hour === 12 ? 12 : hour + 12;
  return hour === 12 ? 0 : hour;
}

/**
 * Parse a KOKO portal timestamp pasted by a merchant.
 *
 * Accepted shapes (times without an explicit offset are read as Asia/Colombo):
 *   2026-09-18 11:30       2026-09-18T11:30:00
 *   18/09/2026 11:30 AM    18-09-2026 11:30
 *   2026-09-18T11:30:00+05:30  (explicit offset honoured as-is)
 * Day-first is assumed for slash/dash dates — Sri Lankan portal convention.
 */
export function parseKokoLinkGeneratedAt(raw: string): Date | null {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  const time = "(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*([AaPp][Mm]?)?";

  // Year-first: 2026-09-18 11:30 / 2026/09/18T11:30:00
  const yearFirst = new RegExp(`^(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})(?:[T ]${time})?$`).exec(trimmed);
  if (yearFirst) {
    const [, y, mo, d, h, mi, se, meridiem] = yearFirst;
    const hour = applyMeridiem(Number(h ?? "0"), meridiem);
    if (hour == null) return null;
    return colomboWallTimeToUtc(Number(y), Number(mo), Number(d), hour, Number(mi ?? "0"), Number(se ?? "0"));
  }

  // Day-first: 18/09/2026 11:30 AM / 18-09-2026 11:30
  const dayFirst = new RegExp(`^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})(?:[T ]${time})?$`).exec(trimmed);
  if (dayFirst) {
    const [, d, mo, y, h, mi, se, meridiem] = dayFirst;
    const hour = applyMeridiem(Number(h ?? "0"), meridiem);
    if (hour == null) return null;
    return colomboWallTimeToUtc(Number(y), Number(mo), Number(d), hour, Number(mi ?? "0"), Number(se ?? "0"));
  }

  // Anything else (e.g. "Sep 18, 2026 11:30 AM", ISO with offset) — only trust it
  // when Date can parse it; treat a trailing offset as authoritative.
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  if (/(?:[+-]\d{2}:?\d{2}|Z)$/i.test(trimmed)) {
    parsed.setUTCSeconds(0, 0);
    return parsed;
  }
  // No offset in the string: Date used the server's zone, so rebuild as Colombo.
  return colomboWallTimeToUtc(
    parsed.getFullYear(),
    parsed.getMonth() + 1,
    parsed.getDate(),
    parsed.getHours(),
    parsed.getMinutes(),
    0,
  );
}

/** Paste-friendly Colombo value (`YYYY-MM-DD HH:mm`) for an instant. */
export function toColomboPasteValue(value: Date | string | null | undefined): string {
  if (value == null || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}`;
}

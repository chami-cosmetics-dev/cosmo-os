/**
 * Wholesale MER codes use WH## prefix (e.g. WH56).
 * Orders with these codes are wholesale SI — separate targets and dashboard tracking.
 */

export const ERP_WHOLESALE_CUSTOMER_GROUP = "Wholesale";

export function normalizeWholesaleMerCodeKey(
  code: string | null | undefined,
): string | null {
  const raw = String(code ?? "").trim();
  if (!raw) return null;
  // WH56, WH-1, WH 1, WH-1-Name
  const m = raw.match(/^WH[\s-]*(\d+)/i);
  if (!m) return null;
  return `WH${m[1]}`;
}

/** Main-dashboard label so wholesale stays off the personal merchant bar. */
export const WHOLESALE_DASHBOARD_NAME_SUFFIX = " · Wholesale";

export function wholesaleDashboardMerchantName(personalName: string): string {
  const name = personalName.trim() || "Wholesale";
  if (name.endsWith(WHOLESALE_DASHBOARD_NAME_SUFFIX)) return name;
  return `${name}${WHOLESALE_DASHBOARD_NAME_SUFFIX}`;
}

/** WH codes from either the wholesale field or the regular MER list. */
export function collectMerchantWholesaleCodes(user: {
  couponCodes?: string[] | null;
  wholesaleCouponCodes?: string[] | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const code of [
    ...(user.wholesaleCouponCodes ?? []),
    ...(user.couponCodes ?? []),
  ]) {
    if (!isWholesaleTrackingCode(code)) continue;
    const key = normalizeWholesaleMerCodeKey(code) ?? code.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(code.trim());
  }
  return out;
}

/**
 * Move WH codes out of the personal MER list into wholesale codes.
 * Keeps the typed spelling. Dedupes WH-1 and WH1 as the same code.
 */
export function splitStaffMerCodes(input: {
  couponCodes: string[];
  wholesaleCouponCodes: string[];
}): { couponCodes: string[]; wholesaleCouponCodes: string[] } {
  const personal: string[] = [];
  const wholesale: string[] = [];
  const seenPersonal = new Set<string>();
  const seenWholesale = new Set<string>();

  const pushWholesale = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed || !isWholesaleTrackingCode(trimmed)) return;
    const key = normalizeWholesaleMerCodeKey(trimmed) ?? trimmed.toLowerCase();
    if (seenWholesale.has(key)) return;
    seenWholesale.add(key);
    wholesale.push(trimmed);
  };
  const pushPersonal = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (isWholesaleTrackingCode(trimmed)) {
      pushWholesale(trimmed);
      return;
    }
    const key = trimmed.toLowerCase();
    if (seenPersonal.has(key)) return;
    seenPersonal.add(key);
    personal.push(trimmed);
  };

  for (const code of input.wholesaleCouponCodes) {
    if (isWholesaleTrackingCode(code)) pushWholesale(code);
    else if (code.trim()) {
      const trimmed = code.trim();
      const key = trimmed.toLowerCase();
      if (!seenWholesale.has(key)) {
        seenWholesale.add(key);
        wholesale.push(trimmed);
      }
    }
  }
  for (const code of input.couponCodes) pushPersonal(code);

  return { couponCodes: personal, wholesaleCouponCodes: wholesale };
}

/** Exact code match, or the same WH number (WH-1 and WH1). */
export function trackingCodesMatch(saved: string, orderCode: string): boolean {
  const a = saved.trim().toLowerCase();
  const b = orderCode.trim().toLowerCase();
  if (a && a === b) return true;
  const ka = normalizeWholesaleMerCodeKey(saved);
  const kb = normalizeWholesaleMerCodeKey(orderCode);
  return ka != null && kb != null && ka === kb;
}

export function isWholesaleTrackingCode(code: string | null | undefined): boolean {
  return normalizeWholesaleMerCodeKey(code) != null;
}

function normalizeWholesaleCouponKey(code: string): string {
  return code.trim().toLowerCase();
}

/** Keys for matching order WH codes to a user's wholesaleCouponCodes. */
export function wholesaleMatchKeysFromCouponCodes(
  couponCodes: string[] | null | undefined,
): string[] {
  const out = new Set<string>();
  for (const code of couponCodes ?? []) {
    const trimmed = String(code ?? "").trim();
    if (!trimmed) continue;
    out.add(trimmed);
    out.add(normalizeWholesaleCouponKey(trimmed));
    const key = normalizeWholesaleMerCodeKey(trimmed);
    if (key) {
      out.add(key);
      out.add(key.toLowerCase());
    }
  }
  return [...out];
}

export function buildWholesaleCouponSet(
  couponCodes: string[] | null | undefined,
): Set<string> {
  return new Set(wholesaleMatchKeysFromCouponCodes(couponCodes).map((k) => k.toLowerCase()));
}

export function orderWholesaleTrackingCoupons(orderCoupons: string[]): string[] {
  return orderCoupons.filter((c) => isWholesaleTrackingCode(c));
}

export function orderIsWholesale(orderCoupons: string[]): boolean {
  return orderWholesaleTrackingCoupons(orderCoupons).length > 0;
}

/** True when this merchant owns a WH code on the order. */
export function wholesaleMerchantMatchesOrder(
  orderCoupons: string[],
  wholesaleCodes: Set<string>,
): boolean {
  for (const code of orderWholesaleTrackingCoupons(orderCoupons)) {
    const trimmed = code.trim().toLowerCase();
    if (wholesaleCodes.has(trimmed)) return true;
    const key = normalizeWholesaleMerCodeKey(code);
    if (key && wholesaleCodes.has(key.toLowerCase())) return true;
  }
  return false;
}

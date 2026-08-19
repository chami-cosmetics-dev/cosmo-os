/**
 * MER allocation matching helpers.
 *
 * Context:
 * - Legacy: `ContactMaster.assignedMerchant` stores a display label (knownName/name/email).
 * - New: ERP-created contacts may store a MER code (e.g. "MER56") instead of a display label.
 *
 * We match both forms to avoid breaking existing allocations.
 */

export function normalizeMerCodeKey(code: string | null | undefined): string | null {
  const raw = String(code ?? "").trim();
  if (!raw) return null;

  // Examples we may see:
  // - MER99
  // - MER99-Dinuli
  // - MER 99 - Dinuli
  const m = raw.match(/^MER\s*(\d+)/i);
  if (!m) return null;
  return `MER${m[1]}`;
}

export function merMatchKeysFromCouponCodes(couponCodes: string[] | null | undefined): string[] {
  const out = new Set<string>();
  for (const code of couponCodes ?? []) {
    const trimmed = String(code ?? "").trim();
    if (!trimmed) continue;

    // Include raw code so we can match either stored format (full vs numeric-only).
    out.add(trimmed);

    const key = normalizeMerCodeKey(trimmed);
    if (key) out.add(key);
  }
  return [...out];
}

/**
 * Pick the first MER code (numeric prefix) from a user's couponCodes.
 * Returns e.g. "MER56" (normalized), or null when the user has no MER.
 */
export function getPrimaryMerCode(couponCodes: string[] | null | undefined): string | null {
  for (const code of couponCodes ?? []) {
    const key = normalizeMerCodeKey(code);
    if (key) return key;
  }
  return null;
}


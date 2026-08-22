const COSMETICS_LK_NAME = /cosmetics\.?\s*lk/i;

/** Matches the Cosmetics.lk shop by location name or short name. Client-safe. */
export function isCosmeticsLkLocationName(
  name: string | null | undefined,
): boolean {
  return COSMETICS_LK_NAME.test((name ?? "").trim());
}

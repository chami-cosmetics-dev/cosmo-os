/**
 * Vault OSF SKU policy from checked workbook:
 * `OSF-vault-2026-09-14 -checked new.xlsx` (2026-09-14).
 *
 * - EXCLUDED: Priority Status = "Remove" (red) — drop from OSF + ROP template.
 * - FORCE_INCLUDED: blue "Newly added" row NTC03-1 — keep even if ERP Item.disabled=1
 *   (it was missing from generated OSF/ROP because ERP marks it disabled/Discontinue).
 * - MANUAL_ROP: yellow rows — ROP was blank in generate; purchasing filled it by hand.
 *   Seed into ProductOsfRop so regenerate / ROP template keep those values.
 */

export const VAULT_OSF_EXCLUDED_SKUS: ReadonlySet<string> = new Set([
  "CT022-1",
  "CT025-1",
  "CT026-1",
  "CT028-1",
  "GEH01-1",
  "HC001-2",
  "JS011-1",
  "NC019-1",
  "NC033-1",
  "NC044-1",
  "NO006-1",
  "NT012-1",
  "NT015-1",
  "NT016-1",
  "NT017-1",
  "NW007-1",
  "NW013-1",
  "NW021-1",
  "NW025-1",
  "NW049-1",
  "NW067-1",
  "PF001-1",
  "PF002-1",
  "PF003-1",
  "PF004-1",
  "PF007-1",
  "RW001-1",
  "SO002-1",
  "SW002-1",
  "SW003-1",
  "SW008-1",
  "SW010-1",
  "SW012-1",
  "SW013-1",
  "SW014-1",
  "SW019-1",
  "SW025-1",
  "SW026-1",
  "SW030-1",
  "SW031-1",
  "SW032-1",
  "SW034-1",
  "SW034-2",
  "SW035-1",
  "SW036-1",
  "SW041-1",
  "SW042-1",
  "WM001-1",
  "WM002-1",
  "WM003-1",
  "WM005-1",
  "WW001-1",
  "WW002-1",
  "WW003-1",
  "WW004-1",
]);

/** SKUs that must appear on OSF/ROP even when ERP has them disabled. */
export const VAULT_OSF_FORCE_INCLUDED_SKUS: ReadonlySet<string> = new Set(["NTC03-1"]);

export type VaultOsfRopTriple = Readonly<Partial<Record<"sv" | "ori" | "ae", number>>>;

/**
 * Manually imported ROP from the checked workbook (yellow + blue).
 * Keys = Variant SKU; values = SV / ORI / AE.
 */
export const VAULT_OSF_MANUAL_ROP: Readonly<Record<string, VaultOsfRopTriple>> = {
  // Blue — Newly added
  "NTC03-1": { sv: 3, ori: 0, ae: 0 },
  // Yellow — missing ROP filled by hand
  "NB013-1": { sv: 0, ori: 0, ae: 0 },
  "NB016-1": { sv: 3, ori: 0, ae: 2 },
  "NC017-1": { sv: 3, ori: 0, ae: 3 },
  "NC020-1": { sv: 3, ori: 0, ae: 0 },
  "NC024-1": { sv: 3, ori: 0, ae: 2 },
  "NC031-1": { sv: 0, ori: 0, ae: 0 },
  "NU002-1": { sv: 0, ori: 0, ae: 0 },
  "NW024-2": { sv: 3, ori: 0, ae: 0 },
  "NW028-2": { sv: 2, ori: 4, ae: 6 },
  "NW031-1": { sv: 3, ori: 0, ae: 0 },
  "NW049-2": { sv: 0, ori: 0, ae: 0 },
  "NW054-1": { sv: 3, ori: 0, ae: 0 },
  "TQ001-1": { sv: 3, ori: 9, ae: 12 },
  "WG001-1": { sv: 3, ori: 0, ae: 0 },
  "WG007-1": { sv: 3, ori: 0, ae: 0 },
  "WG013-1": { sv: 2, ori: 4, ae: 6 },
  "WN008-1": { sv: 3, ori: 0, ae: 0 },
  "WN014-1": { sv: 3, ori: 0, ae: 3 },
  "WN022-1": { sv: 3, ori: 0, ae: 0 },
  "WN023-1": { sv: 3, ori: 0, ae: 0 },
  "WN025-1": { sv: 3, ori: 0, ae: 0 },
};

/** @deprecated Use VAULT_OSF_MANUAL_ROP — kept for older imports. */
export const VAULT_OSF_FORCE_INCLUDED_DEFAULT_ROP = VAULT_OSF_MANUAL_ROP;

export function normalizeVaultOsfSku(sku: string | null | undefined): string {
  return (sku ?? "").trim();
}

export function isVaultOsfExcludedSku(sku: string | null | undefined): boolean {
  const key = normalizeVaultOsfSku(sku);
  return key !== "" && VAULT_OSF_EXCLUDED_SKUS.has(key);
}

export function isVaultOsfForceIncludedSku(sku: string | null | undefined): boolean {
  const key = normalizeVaultOsfSku(sku);
  return key !== "" && VAULT_OSF_FORCE_INCLUDED_SKUS.has(key);
}

/** Drop Remove-list SKUs; keep order otherwise. */
export function applyVaultOsfSkuPolicy<T extends { sku: string }>(rows: T[]): T[] {
  return rows.filter((row) => !isVaultOsfExcludedSku(row.sku));
}

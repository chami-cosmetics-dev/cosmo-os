/**
 * Vault OSF SKU policy from checked workbook:
 * `OSF-vault-2026-09-14 -checked new.xlsx` (2026-09-14).
 *
 * - EXCLUDED: Priority Status = "Remove" (red) — drop from OSF + ROP template.
 * - FORCE_INCLUDED: blue "Newly added" row NTC03-1 — keep even if ERP Item.disabled=1
 *   (it was missing from generated OSF/ROP because ERP marks it disabled/Discontinue).
 * - MANUAL_ROP: yellow rows — ROP was blank in generate; purchasing filled it by hand.
 *   Seed into ProductOsfRop so regenerate / ROP template keep those values.
 *
 * Barcode + Priority Status gaps: overlay snapshot
 * `lib/vault-osf/workbook-upload-overlay-data.json` (regenerate via
 * `node scripts/generate-vault-osf-upload-overlay.mjs path/to/checked.xlsx`),
 * then live GET Item/{sku} when the child-table list is 403.
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

/** Display titles for manual/yellow SKUs (editor search when ProductItem missing). */
export const VAULT_OSF_MANUAL_SKU_META: Readonly<
  Record<string, Readonly<{ title: string; brand: string | null }>>
> = {
  "NTC03-1": {
    title: "Natural Calm Magnesium Powder Raspberry-Lemon Flavor 226g",
    brand: "Natural Calm",
  },
  "NB013-1": {
    title: "Natures Bounty Time Release 5 - HTP 200mg 45 Tablets",
    brand: "Natures Bounty",
  },
  "NB016-1": {
    title: "Natures Bounty Biotin 5000mcg 100 softgels",
    brand: "Natures Bounty",
  },
  "NC017-1": {
    title: "Neocell Super Collagen + Vitamin C Type 1 & 3 for Skin, Hair & Nails 360 Caplets",
    brand: "Neocell",
  },
  "NC020-1": {
    title: "Neocell Hyaluronic Acid 125mg Daily Hydration 60 Vegan Capsules",
    brand: "Neocell",
  },
  "NC024-1": {
    title: "Neocell Grassfed Collagen Peptides + Vitamin C 250 Tablets",
    brand: "Neocell",
  },
  "NC031-1": {
    title: "Neocell Super Collagen Peptides Unflavored 21.1 oz 600 G",
    brand: "Neocell",
  },
  "NU002-1": {
    title: "Nutrimea Biotin Vitamin B8 120 Vegan Capsules",
    brand: "Nutrimea",
  },
  "NW024-2": {
    title: "Now Niacinamide 500mg 100 Veg Capsules",
    brand: "Now",
  },
  "NW028-2": {
    title: "Now Vitamin K-2 100mcg 100 Veg Capsules",
    brand: "Now",
  },
  "NW031-1": {
    title: "Now B-12 1000mcg 100 Lozenges",
    brand: "Now",
  },
  "NW049-2": {
    title: "Now GABA Extra Strength 750mg 100 Veg Capsules",
    brand: "Now",
  },
  "NW054-1": {
    title: "Now Vitamin C 500 250 Tablets",
    brand: "Now",
  },
  "TQ001-1": {
    title: "Toniiq Glutathione 120 Capsules",
    brand: "Toniiq",
  },
  "WG001-1": {
    title: "Wagner Bioactive Collagen 60 Tablets",
    brand: "Wagner",
  },
  "WG007-1": {
    title: "Wagner High Strength Zinc 120 Tablets",
    brand: "Wagner",
  },
  "WG013-1": {
    title: "Wagner Super Bio Magnesium 100 Tablets",
    brand: "Wagner",
  },
  "WN008-1": {
    title: "Webber Naturals Vitamin C 1000mg 150 Tablets",
    brand: "Webber Naturals",
  },
  "WN014-1": {
    title: "Webber Naturals Collagen30 with Hyaluronic Acid 180 Tablets",
    brand: "Webber Naturals",
  },
  "WN022-1": {
    title: "Webber Naturals Omega 3-6-9 1200 mg Fish, Flax & Borage 150 Softgels",
    brand: "Webber Naturals",
  },
  "WN023-1": {
    title: "Webber Naturals Omega 3-6-9 1200 mg Fish, Flax & Borage 280 Softgels",
    brand: "Webber Naturals",
  },
  "WN025-1": {
    title: "Webber Naturals Vitamin B12, Timed Release, 1200 mcg 80 Tablets",
    brand: "Webber Naturals",
  },
};

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

/** Yellow/blue checked-workbook SKUs with seeded ROP (may lack ProductItem). */
export function isVaultOsfManualSku(sku: string | null | undefined): boolean {
  const key = normalizeVaultOsfSku(sku);
  if (!key) return false;
  if (key in VAULT_OSF_MANUAL_ROP) return true;
  const lower = key.toLowerCase();
  return Object.keys(VAULT_OSF_MANUAL_ROP).some((s) => s.toLowerCase() === lower);
}

/** Canonical SKU key for a manual entry (case-insensitive). */
export function resolveVaultOsfManualSkuKey(sku: string | null | undefined): string | null {
  const key = normalizeVaultOsfSku(sku);
  if (!key) return null;
  if (key in VAULT_OSF_MANUAL_ROP) return key;
  const lower = key.toLowerCase();
  return Object.keys(VAULT_OSF_MANUAL_ROP).find((s) => s.toLowerCase() === lower) ?? null;
}

/** Drop Remove-list SKUs; keep order otherwise. */
export function applyVaultOsfSkuPolicy<T extends { sku: string }>(rows: T[]): T[] {
  return rows.filter((row) => !isVaultOsfExcludedSku(row.sku));
}

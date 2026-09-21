/** Pure helpers for Cosmetics shop OSF column keys (no server-only). */

export function cosmoShopKeyFromWarehouse(warehouse: string): string {
  let base = warehouse.trim();
  base = base.replace(/\s*[-–]\s*Cosmo\s*$/i, "");
  base = base.replace(/\s+Warehouse\s*$/i, "");
  base = base.replace(/\s+Shop\s*$/i, "");
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "shop";
  return `cosmo_shop_${slug}`;
}

export function cosmoShopLabelFromWarehouse(warehouse: string): string {
  let base = warehouse.trim();
  base = base.replace(/\s*[-–]\s*Cosmo\s*$/i, "");
  base = base.replace(/\s+Warehouse\s*$/i, "");
  if (!/\bshop\b/i.test(base)) base = `${base} Shop`;
  return base.replace(/\s+/g, " ").trim();
}

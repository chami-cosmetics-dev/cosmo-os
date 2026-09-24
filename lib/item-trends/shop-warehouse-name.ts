/** True for retail shop floors — not Main / Stores / Website / transit. Client-safe. */
export function isShopWarehouseName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return false;
  if (n.includes("website")) return false;
  if (n.includes("goods in transit") || n.includes("transit")) return false;
  if (n.includes("work in progress") || n.includes("finished goods")) return false;
  if (n.startsWith("all warehouses")) return false;
  if (/\bshop\b/.test(n)) return true;
  return false;
}

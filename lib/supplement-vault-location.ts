const SUPPLEMENT_VAULT_NAME = /supplement\s*vault/i;

/** Matches the SupplementVault.lk shop by location name or short name. Client-safe. */
export function isSupplementVaultLocationName(name: string | null | undefined): boolean {
  const raw = (name ?? "").trim();
  if (!raw) return false;
  if (SUPPLEMENT_VAULT_NAME.test(raw)) return true;
  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return compact === "sv" || compact.includes("supplementvault");
}

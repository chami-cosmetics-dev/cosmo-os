/** Cosmo: cosmetics company. Vault: SupplementVault / Vault-named company. */
export function stockPriceMissingCompanyWhere(vaultOs: boolean) {
  if (vaultOs) {
    return {
      OR: [
        { name: { contains: "Vault", mode: "insensitive" as const } },
        { name: { contains: "Supplement", mode: "insensitive" as const } },
      ],
    };
  }
  return { name: { contains: "cosmetic", mode: "insensitive" as const } };
}

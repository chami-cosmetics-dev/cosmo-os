export type LoyaltyReasonOsScope = "both" | "cosmo" | "vault";

export const SEEDED_LOYALTY_REASONS: ReadonlyArray<{
  syncKey: string;
  label: string;
  osScope: LoyaltyReasonOsScope;
}> = [
  {
    syncKey: "seed:potential-customer",
    label: "Potential customer",
    osScope: "both",
  },
  {
    syncKey: "seed:cosmetics-loyalty-customer",
    label: "Cosmetics loyalty customer",
    osScope: "vault",
  },
  {
    syncKey: "seed:supplementvault-loyalty-customer",
    label: "Supplementvault loyalty customer",
    osScope: "cosmo",
  },
];

export function normalizeLoyaltyReasonLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

export function currentLoyaltyReasonOsScope(
  vaultOs: boolean
): Exclude<LoyaltyReasonOsScope, "both"> {
  return vaultOs ? "vault" : "cosmo";
}

export function loyaltyReasonVisibleOnOs(
  osScope: string,
  vaultOs: boolean
): boolean {
  if (osScope === "both") return true;
  return osScope === currentLoyaltyReasonOsScope(vaultOs);
}

export function seedOsScopesForDeploy(
  vaultOs: boolean
): LoyaltyReasonOsScope[] {
  return vaultOs ? ["both", "vault"] : ["both", "cosmo"];
}

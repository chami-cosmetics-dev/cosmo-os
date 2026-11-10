import { describe, expect, it } from "vitest";

import { isSupplementVaultLocationName } from "@/lib/supplement-vault-location";

describe("isSupplementVaultLocationName", () => {
  it("matches Supplement Vault location names", () => {
    expect(isSupplementVaultLocationName("SupplementVault.lk")).toBe(true);
    expect(isSupplementVaultLocationName("Supplement Vault")).toBe(true);
    expect(isSupplementVaultLocationName("SV")).toBe(true);
    expect(isSupplementVaultLocationName("Origins (PVT) LTD")).toBe(false);
    expect(isSupplementVaultLocationName("Cosmetics.lk")).toBe(false);
  });
});

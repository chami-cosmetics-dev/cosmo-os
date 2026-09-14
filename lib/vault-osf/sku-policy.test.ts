import { describe, expect, it } from "vitest";

import {
  applyVaultOsfSkuPolicy,
  isVaultOsfExcludedSku,
  isVaultOsfForceIncludedSku,
  isVaultOsfManualSku,
  resolveVaultOsfManualSkuKey,
  VAULT_OSF_EXCLUDED_SKUS,
  VAULT_OSF_FORCE_INCLUDED_SKUS,
  VAULT_OSF_MANUAL_ROP,
} from "@/lib/vault-osf/sku-policy";

describe("vault OSF sku policy (checked 2026-09-14 workbook)", () => {
  it("excludes Remove-marked SKUs", () => {
    expect(isVaultOsfExcludedSku("SW034-1")).toBe(true);
    expect(isVaultOsfExcludedSku("NW004-2")).toBe(false);
    expect(VAULT_OSF_EXCLUDED_SKUS.size).toBe(55);
  });

  it("force-includes blue Newly added NTC03-1", () => {
    expect(isVaultOsfForceIncludedSku("NTC03-1")).toBe(true);
    expect(VAULT_OSF_FORCE_INCLUDED_SKUS.has("NTC03-1")).toBe(true);
  });

  it("seeds yellow + blue manual ROP from checked workbook", () => {
    expect(Object.keys(VAULT_OSF_MANUAL_ROP)).toHaveLength(22);
    expect(VAULT_OSF_MANUAL_ROP["TQ001-1"]).toEqual({ sv: 3, ori: 9, ae: 12 });
    expect(VAULT_OSF_MANUAL_ROP["NW028-2"]).toEqual({ sv: 2, ori: 4, ae: 6 });
    expect(VAULT_OSF_MANUAL_ROP["NTC03-1"]).toEqual({ sv: 3, ori: 0, ae: 0 });
    expect(VAULT_OSF_MANUAL_ROP["NW031-1"]).toEqual({ sv: 3, ori: 0, ae: 0 });
  });

  it("resolves NW031-1 case-insensitively as manual SKU", () => {
    expect(resolveVaultOsfManualSkuKey("Nw031-1")).toBe("NW031-1");
    expect(isVaultOsfManualSku("nw031-1")).toBe(true);
  });

  it("applyVaultOsfSkuPolicy drops excluded only", () => {
    const rows = [{ sku: "NW004-2" }, { sku: "SW034-1" }, { sku: "NTC03-1" }];
    expect(applyVaultOsfSkuPolicy(rows).map((r) => r.sku)).toEqual(["NW004-2", "NTC03-1"]);
  });
});

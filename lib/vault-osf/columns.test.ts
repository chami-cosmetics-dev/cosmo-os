import { describe, expect, it } from "vitest";

import type { OsfResolvedColumn } from "@/lib/osf/column-config";
import { isVaultOsfConfigured, resolveVaultBusinessUnits } from "@/lib/vault-osf/columns";
import { isExcludedErpCompany } from "@/lib/vault-osf/types";

function col(partial: Partial<OsfResolvedColumn> & { key: string }): OsfResolvedColumn {
  return {
    id: partial.key,
    label: partial.key.toUpperCase(),
    companyLocationId: null,
    companyLocationName: null,
    erpnextInstanceId: "inst-1",
    directWarehouses: [],
    includeInStock: true,
    includeInRop: true,
    sortOrder: 0,
    active: true,
    warehouses: ["WH"],
    erpCompany: "SupplementVault.lk",
    ...partial,
  };
}

describe("vault OSF columns", () => {
  it("excludes Origins Online as a mistaken company", () => {
    expect(isExcludedErpCompany("Origins Online")).toBe(true);
    expect(isExcludedErpCompany("Origins (PVT) LTD")).toBe(false);
  });

  it("resolves sv/ori/ae and drops Origins Online mapping", () => {
    const units = resolveVaultBusinessUnits([
      col({ key: "sv", erpCompany: "SupplementVault.lk", erpnextInstanceId: "e1" }),
      col({ key: "ori", erpCompany: "Origins (PVT) LTD", erpnextInstanceId: "e2" }),
      col({ key: "ae", erpCompany: "AE (PVT) LTD", erpnextInstanceId: "e2" }),
      col({ key: "online", erpCompany: "Origins Online", erpnextInstanceId: "e2" }),
    ]);
    expect(units.map((u) => u.key)).toEqual(["sv", "ori", "ae"]);
    expect(units.find((u) => u.erpCompany === "Origins Online")).toBeUndefined();
  });

  it("detects Vault OSF configuration via erpCompany", () => {
    expect(isVaultOsfConfigured([col({ key: "sv" })])).toBe(true);
    expect(isVaultOsfConfigured([col({ key: "lmj", erpCompany: null })])).toBe(false);
  });
});

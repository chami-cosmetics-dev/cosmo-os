import type { OsfResolvedColumn } from "@/lib/osf/column-config";
import {
  EXCLUDED_ERP_COMPANIES,
  isExcludedErpCompany,
  VAULT_OSF_UNIT_KEYS,
  type VaultBusinessUnit,
  type VaultOsfUnitKey,
} from "@/lib/vault-osf/types";

const LABELS: Record<VaultOsfUnitKey, string> = {
  sv: "SV",
  ori: "ORI",
  ae: "AE",
};

export function isVaultOsfConfigured(columns: OsfResolvedColumn[]): boolean {
  return columns.some((c) => c.active && Boolean(c.erpCompany?.trim()));
}

export function resolveVaultBusinessUnits(columns: OsfResolvedColumn[]): VaultBusinessUnit[] {
  const byKey = new Map<string, OsfResolvedColumn>();
  for (const col of columns) {
    if (!col.active) continue;
    byKey.set(col.key, col);
  }

  const units: VaultBusinessUnit[] = [];
  for (const key of VAULT_OSF_UNIT_KEYS) {
    const col = byKey.get(key);
    if (!col) continue;
    const erpCompany = col.erpCompany?.trim() ?? "";
    if (!erpCompany || isExcludedErpCompany(erpCompany)) continue;
    if (!col.erpnextInstanceId) continue;
    units.push({
      key,
      label: col.label?.trim() || LABELS[key],
      erpInstanceId: col.erpnextInstanceId,
      erpCompany,
      warehouses: col.warehouses,
      sortOrder: col.sortOrder,
    });
  }
  return units;
}

export function vaultOsfNotConfiguredMessage(units: VaultBusinessUnit[]): string | null {
  if (units.length === VAULT_OSF_UNIT_KEYS.length) return null;
  return "Vault OSF is not configured. Seed SV / ORI / AE columns with erpCompany first.";
}

export { EXCLUDED_ERP_COMPANIES };

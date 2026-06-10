export type TenantId = "cosmetics" | "vault";

export type TenantDefinition = {
  id: TenantId;
  label: string;
  shortLabel: string;
};

export const TENANT_DEFINITIONS: TenantDefinition[] = [
  {
    id: "cosmetics",
    label: "Cosmetics.lk",
    shortLabel: "Cosmetics",
  },
  {
    id: "vault",
    label: "Supplement Vault",
    shortLabel: "Vault",
  },
];

export function isTenantId(value: string | undefined): value is TenantId {
  return value === "cosmetics" || value === "vault";
}

export function getTenantDefinition(tenantId: TenantId) {
  return TENANT_DEFINITIONS.find((tenant) => tenant.id === tenantId)!;
}

export function getDeliveryKey(tenant: TenantId, id: string) {
  return `${tenant}:${id}`;
}

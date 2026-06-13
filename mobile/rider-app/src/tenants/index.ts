import { APP_ENV } from "@/src/config";
import { API_BASE_URL, COSMETICS_API_URL, VAULT_API_URL } from "@/src/env";
import type { TenantId } from "@/src/tenants/config";
import { TENANT_DEFINITIONS } from "@/src/tenants/config";
export type TenantConfig = {
  id: TenantId;
  label: string;
  shortLabel: string;
  apiUrl: string;
};

function resolveTenantApiUrl(tenantId: TenantId) {
  if (tenantId === "cosmetics") {
    return (
      COSMETICS_API_URL ??
      API_BASE_URL ??
      (APP_ENV === "development" ? "http://10.0.2.2:3000" : null)
    );
  }

  return (
    VAULT_API_URL ??
    (APP_ENV === "development" ? API_BASE_URL : null)
  );
}

export function getConfiguredTenants(): TenantConfig[] {
  return TENANT_DEFINITIONS.flatMap((tenant) => {
    const apiUrl = resolveTenantApiUrl(tenant.id);
    if (!apiUrl) return [];
    return [{ ...tenant, apiUrl }];
  });
}

export function getTenantApiUrl(tenantId: TenantId) {
  return getConfiguredTenants().find((tenant) => tenant.id === tenantId)?.apiUrl ?? null;
}

export function getTenantConfig(tenantId: TenantId) {
  return getConfiguredTenants().find((tenant) => tenant.id === tenantId) ?? null;
}

import { APP_ENV } from "@/src/config";
import type { TenantId } from "@/src/tenants/config";
import { TENANT_DEFINITIONS } from "@/src/tenants/config";

export type TenantConfig = {
  id: TenantId;
  label: string;
  shortLabel: string;
  apiUrl: string;
};

function readEnvUrl(key: string) {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : null;
}

function resolveTenantApiUrl(tenantId: TenantId) {
  if (tenantId === "cosmetics") {
    return (
      readEnvUrl("EXPO_PUBLIC_COSMETICS_API_URL") ??
      readEnvUrl("EXPO_PUBLIC_API_BASE_URL") ??
      (APP_ENV === "development" ? "http://10.0.2.2:3000" : null)
    );
  }

  return (
    readEnvUrl("EXPO_PUBLIC_VAULT_API_URL") ??
    (APP_ENV === "development" ? readEnvUrl("EXPO_PUBLIC_API_BASE_URL") : null)
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

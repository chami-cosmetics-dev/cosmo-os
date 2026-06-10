import { apiClient } from "@/src/api/client";
import { getConfiguredTenants } from "@/src/tenants";
import type { RiderSession, TenantRiderSession } from "@/src/storage/session";
import type { TenantId } from "@/src/tenants/config";

type LoginPayload = {
  email: string;
  password: string;
  deviceName?: string;
};

export async function loginToAllTenants(payload: LoginPayload): Promise<RiderSession> {
  const tenants = getConfiguredTenants();
  const results = await Promise.all(
    tenants.map(async (tenant) => {
      const session = await apiClient.login(tenant.id, payload);
      return [tenant.id, session] as const;
    })
  );

  const activeTenants = results.filter((entry): entry is [TenantId, TenantRiderSession] => !!entry[1]);

  if (activeTenants.length === 0) {
    throw new Error("Invalid rider credentials or no access on configured companies.");
  }

  return {
    tenants: Object.fromEntries(activeTenants) as Partial<Record<TenantId, TenantRiderSession>>,
  };
}

export async function logoutFromAllTenants(session: RiderSession | null) {
  if (!session) return;

  await Promise.all(
    (Object.keys(session.tenants) as TenantId[]).map((tenantId) => apiClient.logout(tenantId))
  );
}

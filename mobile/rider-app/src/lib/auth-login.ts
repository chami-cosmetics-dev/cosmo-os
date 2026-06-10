import { apiClient } from "@/src/api/client";
import { getConfiguredTenants } from "@/src/tenants";
import type { RiderSession, TenantRiderSession } from "@/src/storage/session";
import type { TenantId } from "@/src/tenants/config";

type LoginPayload = {
  email: string;
  password: string;
  deviceName?: string;
};

export class LoginError extends Error {
  failures: Array<{ label: string; message: string }>;
  successes: string[];

  constructor(params: {
    message: string;
    failures: Array<{ label: string; message: string }>;
    successes?: string[];
  }) {
    super(params.message);
    this.name = "LoginError";
    this.failures = params.failures;
    this.successes = params.successes ?? [];
  }
}

function formatLoginFailureMessage(failures: Array<{ label: string; message: string }>) {
  const lines = failures.map((failure) => `• ${failure.label}: ${failure.message}`);
  return `Could not sign in to any company:\n\n${lines.join("\n")}`;
}

export async function loginToAllTenants(payload: LoginPayload): Promise<RiderSession> {
  const tenants = getConfiguredTenants();

  if (tenants.length === 0) {
    throw new LoginError({
      message: "No company APIs are configured. Check EXPO_PUBLIC_COSMETICS_API_URL and EXPO_PUBLIC_VAULT_API_URL in .env.",
      failures: [],
    });
  }

  const results = await Promise.all(
    tenants.map(async (tenant) => {
      const result = await apiClient.login(tenant.id, payload);
      return { tenant, result };
    })
  );

  const activeTenants: Array<[TenantId, TenantRiderSession]> = [];
  const failures: Array<{ label: string; message: string }> = [];

  for (const { tenant, result } of results) {
    if (result.ok) {
      activeTenants.push([tenant.id, result.session]);
      continue;
    }

    failures.push({
      label: tenant.label,
      message: result.message,
    });
  }

  if (activeTenants.length === 0) {
    throw new LoginError({
      message: formatLoginFailureMessage(failures),
      failures,
    });
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

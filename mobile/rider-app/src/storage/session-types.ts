import type { TenantId } from "@/src/tenants/config";

export type TenantRiderSession = {
  accessToken: string;
  expiresAt: string;
  rider: {
    id: string;
    name: string | null;
    email: string | null;
    mobile: string | null;
    company?: {
      id: string;
      name: string;
    } | null;
  };
};

export type RiderSession = {
  tenants: Partial<Record<TenantId, TenantRiderSession>>;
};

export function hasActiveSession(session: RiderSession | null) {
  return !!session && Object.keys(session.tenants).length > 0;
}

export function getActiveTenantIds(session: RiderSession | null): TenantId[] {
  if (!session) return [];
  return Object.entries(session.tenants)
    .filter((entry): entry is [TenantId, TenantRiderSession] => !!entry[1]?.accessToken)
    .map(([tenantId]) => tenantId);
}

export function getTenantSession(session: RiderSession | null, tenantId: TenantId) {
  return session?.tenants[tenantId] ?? null;
}

export function getPrimaryTenantSession(session: RiderSession | null) {
  if (!session) return null;
  return session.tenants.cosmetics ?? session.tenants.vault ?? null;
}

export function removeTenantFromSession(session: RiderSession, tenantId: TenantId): RiderSession | null {
  const nextTenants = { ...session.tenants };
  delete nextTenants[tenantId];
  if (Object.keys(nextTenants).length === 0) return null;
  return { tenants: nextTenants };
}

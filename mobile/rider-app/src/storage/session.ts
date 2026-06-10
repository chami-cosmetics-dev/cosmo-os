import * as SecureStore from "expo-secure-store";
import type { TenantId } from "@/src/tenants/config";
import type { RiderSession, TenantRiderSession } from "@/src/storage/session-types";

const SESSION_KEY = "cosmo-rider-session";

function isTenantRiderSession(value: unknown): value is TenantRiderSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { accessToken?: unknown; expiresAt?: unknown };
  return typeof candidate.accessToken === "string" && typeof candidate.expiresAt === "string";
}

function normalizeSession(raw: unknown): RiderSession | null {
  if (!raw || typeof raw !== "object") return null;

  if ("tenants" in raw && raw.tenants && typeof raw.tenants === "object") {
    const tenants = raw.tenants as Partial<Record<TenantId, TenantRiderSession>>;
    const normalized = Object.fromEntries(
      Object.entries(tenants).filter((entry): entry is [TenantId, TenantRiderSession] =>
        isTenantRiderSession(entry[1])
      )
    ) as Partial<Record<TenantId, TenantRiderSession>>;

    return Object.keys(normalized).length > 0 ? { tenants: normalized } : null;
  }

  if ("accessToken" in raw && isTenantRiderSession(raw)) {
    return { tenants: { cosmetics: raw } };
  }

  return null;
}

export async function saveSession(session: RiderSession) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession() {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  return raw ? normalizeSession(JSON.parse(raw)) : null;
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export type { RiderSession, TenantRiderSession };

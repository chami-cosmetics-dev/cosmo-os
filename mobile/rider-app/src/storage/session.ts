import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TenantId } from "@/src/tenants/config";
import type { RiderSession, TenantRiderSession } from "@/src/storage/session-types";

/**
 * Use AsyncStorage instead of SecureStore for session tokens.
 * Honor/Huawei Keystore + EncryptedSharedPreferences can native-crash the process
 * on open (splash shows, then app dies) — JS try/catch cannot catch that.
 */
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
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw));
  } catch {
    await clearSession();
    return null;
  }
}

export async function clearSession() {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage errors during logout/clear.
  }
}

export type { RiderSession, TenantRiderSession };

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { loginToAllTenants, logoutFromAllTenants } from "@/src/lib/auth-login";
import { clearSession, loadSession, saveSession, type RiderSession } from "@/src/storage/session";
import { getActiveTenantIds, getPrimaryTenantSession, hasActiveSession } from "@/src/storage/session-types";

type LoginPayload = {
  email: string;
  password: string;
  deviceName?: string;
};

type AuthContextValue = {
  session: RiderSession | null;
  bootstrapped: boolean;
  activeTenantIds: ReturnType<typeof getActiveTenantIds>;
  primaryRider: NonNullable<ReturnType<typeof getPrimaryTenantSession>>["rider"] | null;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  clearSessionLocally: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<RiderSession | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  const clearSessionLocally = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  useEffect(() => {
    loadSession().then((stored) => {
      setSession(stored);
      setBootstrapped(true);
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      bootstrapped,
      activeTenantIds: getActiveTenantIds(session),
      primaryRider: getPrimaryTenantSession(session)?.rider ?? null,
      login: async (payload) => {
        const result = await loginToAllTenants(payload);
        await saveSession(result);
        setSession(result);
      },
      logout: async () => {
        const current = await loadSession();
        await logoutFromAllTenants(current);
        await clearSessionLocally();
      },
      clearSessionLocally,
    }),
    [bootstrapped, clearSessionLocally, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export { hasActiveSession };

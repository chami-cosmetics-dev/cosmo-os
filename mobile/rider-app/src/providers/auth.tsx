import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { apiClient } from "@/src/api/client";
import { clearSession, loadSession, saveSession, type RiderSession } from "@/src/storage/session";

type LoginPayload = {
  email: string;
  password: string;
  deviceName?: string;
};

type AuthContextValue = {
  session: RiderSession | null;
  bootstrapped: boolean;
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
      login: async (payload) => {
        const result = await apiClient.post<RiderSession>("/api/mobile/v1/auth/login", payload);
        await saveSession(result);
        setSession(result);
      },
      logout: async () => {
        try {
          await apiClient.post("/api/mobile/v1/auth/logout");
        } catch {
          // Clear local session even if revoke fails (offline/expired token).
        }
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

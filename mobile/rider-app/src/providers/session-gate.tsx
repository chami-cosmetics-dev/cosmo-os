import { useEffect, type PropsWithChildren } from "react";
import { Redirect, usePathname } from "expo-router";
import { setUnauthorizedHandler } from "@/src/api/client";
import { hasActiveSession, useAuth } from "@/src/providers/auth";

export function SessionGate({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { session, bootstrapped, clearSessionLocally } = useAuth();

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      await clearSessionLocally();
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [clearSessionLocally]);

  // Avoid router.replace on Android release builds — it can crash the process on launch
  // (Expo Router / SDK 54). Prefer declarative Redirect instead.
  if (bootstrapped && !hasActiveSession(session) && pathname !== "/login") {
    return <Redirect href="/login" />;
  }

  return children;
}

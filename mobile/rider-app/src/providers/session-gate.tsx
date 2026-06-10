import { useEffect, type PropsWithChildren } from "react";
import { usePathname, useRouter } from "expo-router";
import { setUnauthorizedHandler } from "@/src/api/client";
import { hasActiveSession, useAuth } from "@/src/providers/auth";

export function SessionGate({ children }: PropsWithChildren) {
  const router = useRouter();
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

  useEffect(() => {
    if (!bootstrapped) return;
    if (!hasActiveSession(session) && pathname !== "/login") {
      router.replace("/login");
    }
  }, [bootstrapped, pathname, router, session]);

  return children;
}

import { useEffect, type PropsWithChildren } from "react";
import { setUnauthorizedHandler } from "@/src/api/client";
import { useAuth } from "@/src/providers/auth";

/** Registers 401 handler only. Initial auth redirect lives in app/index.tsx. */
export function SessionGate({ children }: PropsWithChildren) {
  const { clearSessionLocally } = useAuth();

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      await clearSessionLocally();
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [clearSessionLocally]);

  return children;
}

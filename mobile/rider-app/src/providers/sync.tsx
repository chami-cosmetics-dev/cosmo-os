import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import NetInfo from "@react-native-community/netinfo";
import { API_BASE_URL } from "@/src/config";
import { getQueue, replaceQueue } from "@/src/storage/offline-queue";
import { loadSession } from "@/src/storage/session";

type SyncContextValue = {
  pendingCount: number;
  flushQueue: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: PropsWithChildren) {
  const [pendingCount, setPendingCount] = useState(0);

  async function refreshCount() {
    const queue = await getQueue();
    setPendingCount(queue.length);
  }

  async function flushQueue() {
    const session = await loadSession();
    if (!session?.accessToken) return;

    const queue = await getQueue();
    const remaining = [];

    for (const item of queue) {
      try {
        const response = await fetch(`${API_BASE_URL}${item.endpoint}`, {
          method: item.method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify(item.body),
        });

        if (!response.ok) {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    await replaceQueue(remaining);
    setPendingCount(remaining.length);
  }

  useEffect(() => {
    void refreshCount();
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        void flushQueue();
      }
    });
    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({
      pendingCount,
      flushQueue,
    }),
    [pendingCount]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used within SyncProvider");
  }
  return context;
}
